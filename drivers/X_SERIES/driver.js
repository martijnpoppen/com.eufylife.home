const mainDriver = require('../main-driver');

module.exports = class driver_X_SERIES extends mainDriver {
    deviceType() {
        return 'X-series';
    }
}