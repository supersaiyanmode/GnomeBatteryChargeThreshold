const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const {
    Slider
} = imports.ui.slider;

const Battery = Me.imports.battery;

const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

var ThresholdSliderItem = GObject.registerClass({
    GTypeName: 'ThresholdSliderItem',
    Signals: {
        'changed': {
            param_types: []
        }
    }
}, class ThresholdSliderItem extends PopupMenu.PopupMenuItem {
    _init() {
        super._init("");

        this._slider = new Slider(100);
        this._slider.connect('drag-end', this._onSliderChanged.bind(this));

        this._label = new St.Label({
            y_expand: false,
            x_expand: false,
            text: ''
        });

        this.add_child(this._label);
        this.add_child(this._slider);
    }

    _onSliderChanged() {
        this.emit('changed');
        this._updateThreshold(Math.floor(this._slider.value * 100));
    }

    updateThreshold(value) {
        this._slider.value = value / 100.0;
        this._updateThreshold(value);
    }

    _updateThreshold(value) {
        this._label.text = `Charge threshold at ${value}%`;
    }

    getThreshold() {
        return Math.floor(this._slider.value * 100);
    }
});

class BatteryThresholdController {
    constructor() {}

    enable() {
        this._thresholdController = new Battery.ThresholdController();

        this._sliderItem = new ThresholdSliderItem(this._thresholdController);

        this._thresholdController.connect('changed', () => {
            this._sliderItem.updateThreshold(this._thresholdController.getThreshold());
        });

        this._sliderItem.connect('changed', () => {
            this._thresholdController.setThreshold(this._sliderItem.getThreshold());
        });

        const powerMenu = Main.panel.statusArea.aggregateMenu._power.menu.firstMenuItem.menu;
        powerMenu.addMenuItem(this._sliderItem, 1);
        powerMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 2);
    }


    disable() {
        this._sliderItem.destroy();
    }
}


var controller = null;

function init() {
    controller = new BatteryThresholdController();
}

function enable() {
    controller.enable();
}

function disable() {
    controller.disable();
}
