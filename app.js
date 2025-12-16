'use strict';

const Homey = require('homey');
const { EufyClean } = require('eufy-clean');
const { decrypt, sleep } = require('./lib/helpers.js');

class App extends Homey.App {
    trace() {
        console.trace.bind(this, '[log]').apply(this, arguments);
    }

    debug() {
        console.debug.bind(this, '[debug]').apply(this, arguments);
    }

    info() {
        console.log.bind(this, '[info]').apply(this, arguments);
    }

    log() {
        console.log.bind(this, '[log]').apply(this, arguments);
    }

    warn() {
        console.warn.bind(this, '[warn]').apply(this, arguments);
    }

    error() {
        console.error.bind(this, '[error]').apply(this, arguments);
    }

    fatal() {
        console.error.bind(this, '[fatal]').apply(this, arguments);
    }

    // -------------------- INIT ----------------------

    async onInit() {
        this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);
        this.driversInitialized = false;
        this.eufyClean = null;

        this.handleEmitters();
    }

    async onUninit() {
        this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} stopped...`);
        await this.disableDevices();
        this.eufyClean = null;
    }

    async initApp() {
        this.initEufyClean();
    }

    async handleEmitters() {
        this.homey.on('eufy-clean:data', (data) => {
            this.log('[handleEmitters] Received data:', data);
            this.updateDevice(data);
        });
    }

    // ---------------------------- GETTERS/SETTERS ----------------------------------

    async initDrivers() {
        if (!this.driversInitialized) {
            this.driversInitialized = true;
            await sleep(2000);
            this.initApp();
        }
    }

    async getAllDevices() {
        const drivers = await this.homey.drivers.getDrivers();
        let allDevices = [];

        for (const driver of Object.values(drivers)) {
            const devices = driver.getDevices();
            allDevices = [...allDevices, ...devices];
        }

        return allDevices.length ? [allDevices[0]] : allDevices;
    }

    async initDevices() {
        const deviceList = await this.getAllDevices();
        deviceList.every(async (device, index) => {
            await device.onStartup(index);
        });
    }

    async updateDevice(devId) {
        try {
            const deviceList = await this.getAllDevices();
            const device = deviceList.find(async (d, index) => {
                const settings = d.getSettings();
                return settings.deviceId === devId;
            });
            await device.setCapabilityValues();
        } catch (error) {
            this.homey.app.error('[updateDevice]', error);
        }
    }

    async disableDevices() {
        const deviceList = await this.getAllDevices();
        for (const device of deviceList) {
            try {
                await device.disableDevice();
            } catch (error) {
                console.log(error);
            }
        }
    }

    async enableDevices(loginData) {
        for (const device of this.deviceList) {
            try {
                device.setSettings({ ...loginData });
                await device.enableDevice();
            } catch (error) {
                this.error(error);
            }
        }
    }

    // -------------------------- EUFY CLEAN -------------------------
    async initEufyClean(driverUsername = null, driverPassword = null) {
        const deviceList = await this.getAllDevices();

        if (driverUsername && driverPassword) {
            // Initialize when called from driver

            this.eufyClean = new EufyClean(driverUsername, driverPassword, this.homey.emit.bind(this.homey));
            await this.eufyClean.init();
        } else if (!this.eufyClean && deviceList.length) {
            // Initialize on startup when there are paired devices

            const device = deviceList[0];
            const settings = device.getSettings();
            const { username, password } = settings;

            if (username && password) {
                this.eufyClean = new EufyClean(decrypt(username), decrypt(password), this.homey.emit.bind(this.homey));
                await this.eufyClean.init();
                await this.initDevices();
            } else {
                // No login data found, initialize without login - only for LocalConnect
                this.eufyClean = new EufyClean(null, null, this.homey.emit.bind(this.homey));
                await this.initDevices();
            }
        }
    }
}

module.exports = App;
