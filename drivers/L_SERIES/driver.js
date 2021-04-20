const mainDriver = require('../main-driver');

module.exports = class driver_L_SERIES extends mainDriver {
    deviceType() {
        return 'L-series';
    }
}