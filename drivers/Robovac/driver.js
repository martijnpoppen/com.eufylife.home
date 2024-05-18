const mainDriver = require('../main-driver');

module.exports = class driver_Robovac extends mainDriver {
    deviceType() {
        return 'Robovac';
    }
}