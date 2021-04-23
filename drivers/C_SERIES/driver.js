const mainDriver = require('../main-driver');

module.exports = class driver_C_SERIES extends mainDriver {
    deviceType() {
        return 'C-series';
    }
}