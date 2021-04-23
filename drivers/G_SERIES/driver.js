const mainDriver = require('../main-driver');

module.exports = class driver_G_SERIES extends mainDriver {
    deviceType() {
        return 'G-series';
    }
}