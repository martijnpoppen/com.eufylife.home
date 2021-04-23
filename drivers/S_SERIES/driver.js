const mainDriver = require('../main-driver');

module.exports = class driver_S_SERIES extends mainDriver {
    deviceType() {
        return 'S-series';
    }
}