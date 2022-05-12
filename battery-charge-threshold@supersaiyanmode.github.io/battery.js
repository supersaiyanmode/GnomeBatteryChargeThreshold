const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

async function readFile(path) {
    const file = Gio.File.new_for_path(path);
    const [, contents, etag] = await new Promise((resolve, reject) => {
        file.load_contents_async(
            null,
            (file_, result) => {
                try {
                    resolve(file.load_contents_finish(result));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
    return new TextDecoder('utf-8').decode(contents);
}

function writeFile(path, contents) {
    const file = Gio.File.new_for_path(path);
    return new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(
            new GLib.Bytes(contents),
            null,
            false,
            Gio.FileCreateFlags.NONE,
            null,
            (file_, result) => {
                try {
                    resolve(file.replace_contents_finish(result));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

async function listBatteries() {
    const directory = Gio.File.new_for_path('/sys/class/power_supply/');
    const iter = await new Promise((resolve, reject) => {
        directory.enumerate_children_async(
            'standard::*',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT,
            null,
            (file_, result) => {
                try {
                    resolve(directory.enumerate_children_finish(result));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
    const infos = await new Promise((resolve, reject) => {
        iter.next_files_async(
            10, // max results
            GLib.PRIORITY_DEFAULT,
            null,
            (iter_, res) => {
                try {
                    resolve(iter.next_files_finish(res));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });

    return new Promise((resolve, reject) => {
        if (infos.length === 0) {
            reject();
            return;
        }

        resolve(infos.map(x => x.get_name()));
    });
}

const Battery = class Battery {
    constructor(path) {
        this.basePath = path;
        this.charge_threshold = null;
        this.thresholdPath = `${this.basePath}/charge_control_end_threshold`;
    }

    async loadInfo() {
        try {
            this.charge_threshold = parseInt(await readFile(this.thresholdPath));
        } catch (e) {
            log(`Error while trying to retrieve info for ${this.basePath}: ${e}`);
        }
    }

    getChargeThreshold() {
        return this.charge_threshold;
    }

    setChargeThreshold(value) {
        writeFile(this.thresholdPath, value.toString())
            .then(() => {
                log(`Charge threshold updated to: ${value}`);
            })
            .catch(e => {
                log(`Error updating charge threshold: ${e}`);
            });
    }
};

async function fetchBatteryInfo(batteryPath) {
    log(`Fetching battery info for: ${batteryPath}`);
    return new Promise(async (resolve, reject) => {
        const battery = new Battery(`/sys/class/power_supply/${batteryPath}`);
        await battery.loadInfo()
        log(`Finished loading info for battery: ${batteryPath}`);
        resolve(battery);
    });
}

var ThresholdController = GObject.registerClass({
        GTypeName: 'ThresholdController',
        Signals: {
            'changed': {
                param_types: []
            }
        }
    },
    class ThresholdController extends GObject.Object {
        constructor() {
            super();
            this._batteries = [];
            const self = this;
            listBatteries()
                .then(paths => Promise.all(paths.map(x => fetchBatteryInfo(x))))
                .then(res => res.filter(x => x.getChargeThreshold() !== null))
                .then(batteries => {
                    self._batteries = batteries;
                    self._batteries.forEach(self.monitorBattery.bind(self));
                })
                .catch(e => {
                    log(`No batteries found: ${e}`);
                });
        }

        monitorBattery(battery) {
            this.emit('changed');

            log(`Monitoring: ${battery.thresholdPath}`);
        }

        getThreshold() {
            // Just the first battery for now.
            if (this._batteries !== null && this._batteries.length) {
                return this._batteries[0].getChargeThreshold();
            }
        }

        setThreshold(value) {
            // Just the first battery for now.
            if (this._batteries !== null && this._batteries.length) {
                return this._batteries[0].setChargeThreshold(value);
            }
        }
    });
