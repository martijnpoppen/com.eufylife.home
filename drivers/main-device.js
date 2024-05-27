const Homey = require('homey');
const { EufyCleanDevice, 
    EUFY_CLEAN_GET_STATE, 
    EUFY_CLEAN_VACUUMCLEANER_STATE, 
    EUFY_CLEAN_LEGACY_CLEAN_SPEED, 
    EUFY_CLEAN_WORK_STATUS, 
    EUFY_CLEAN_ERROR_CODES, 
    EUFY_CLEAN_GET_CLEAN_SPEED 
} = require('../lib/eufy-clean');
const { sleep, decrypt } = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        const settings = this.getSettings();
        const deviceObject = this.getData();

        this.homey.app.log('[Device] - init =>', this.getName());
        this.setUnavailable(`${this.getName()} is initializing...`);

        if ('localKey' in settings && settings.localKey !== 'deprecated') {
            this.setUnavailable('Legacy API detected. Please repair the device to use the new API.');
        }

        const sleepIndex = this.homey.app.deviceList.findIndex((device) => {
            const driverDeviceObject = device.getData();
            return driverDeviceObject.id === deviceObject.id;
        });

        const sleepTime = (sleepIndex + 1) * 6000;
        this.homey.app.log('[Device] - sleep =>', this.getName(), sleepTime);
        await sleep(sleepTime);

        this.registerCapabilityListener('vacuumcleaner_state', this._onVacuumCapabilityChanged.bind(this));
        this.registerCapabilityListener('action_clean_speed', this._onCleanSpeedChanged.bind(this));

        await this.checkCapabilities();

        await this.initApi();
        await this.setCapabilityValuesInterval();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, newSettings);

        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }

        this.initApi(newSettings);
        this.setCapabilityValuesInterval();
    }

    onDeleted() {
        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }
    }

    async onRepair(settings) {
        this.homey.app.log(`[Device] ${this.getName()} - onRepair`);
        await this.checkCapabilities();

        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }

        this.initApi(settings);
        this.setCapabilityValuesInterval();
    }

    async initApi(overrideSettings = null) {
        try {
            const settings = overrideSettings ? overrideSettings : this.getSettings()
            let { deviceId, username, password, deviceModel, mqtt } = settings;
            this.homey.app.log(`[Device] ${this.getName()} - initApi settings`, {...settings, username: 'LOG', password: '***'});

            this.config = { username: decrypt(username), password: decrypt(password), deviceId, deviceModel, mqtt, debug: false };

            this.homey.app.log(`[Device] ${this.getName()} - initApi`);

            const eufyCleanDevice = new EufyCleanDevice(this.config);
            this.eufyRoboVac = eufyCleanDevice.getInstance();

            await this.eufyRoboVac.connect();
            await this.eufyRoboVac.formatStatus();

            this.setAvailable();
            this.setCapabilityValues();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        const driverCapabilities = driverManifest.capabilities;

        const deviceCapabilities = this.getCapabilities();

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);

        if (driverCapabilities.length > deviceCapabilities.length) {
            await this.updateCapabilities(driverCapabilities);
        }

        return deviceCapabilities;
    }

    async updateCapabilities(driverCapabilities) {
        this.homey.app.log(`[Device] ${this.getName()} - Add new capabilities =>`, driverCapabilities);
        try {
            driverCapabilities.forEach((c) => {
                this.addCapability(c);
            });
            await sleep(2000);
        } catch (error) {
            this.homey.app.log(error);
        }
    }

    async setCapabilityValues() {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        try {
            await this.eufyRoboVac.updateDevice();

            const batteryLevel = (await this.eufyRoboVac.getBatteryLevel()) || 1;
            const workStatus = await this.eufyRoboVac.getWorkStatus();
            const workMode = await this.eufyRoboVac.getWorkMode();
            const cleanSpeed = await this.eufyRoboVac.getCleanSpeed();
            const errorCode = await this.eufyRoboVac.getErrorCode();
            const currentState = EUFY_CLEAN_GET_STATE[workStatus] || EUFY_CLEAN_GET_STATE[workMode];

            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workStatus`, workStatus);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workMode`, workMode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - currentState`, currentState);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - cleanSpeed`, cleanSpeed);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - errorCode`, errorCode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - batteryLevel`, batteryLevel);

            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));
            await this.setCapabilityValue('alarm_battery', parseInt(batteryLevel) < 15);

            if (workStatus) {
                await this.setCapabilityValue('measure_is_charging', workStatus === 'charging');
                await this.setCapabilityValue('measure_recharge_needed', workStatus === 'recharge' || workStatus === 'charging');
                await this.setCapabilityValue('measure_work_status', EUFY_CLEAN_WORK_STATUS[workStatus.toUpperCase()]);
            }

            if (currentState) {
                await this.setCapabilityValue('measure_docked', currentState === 'docked' || currentState === 'stopped' || currentState === 'charging' || currentState === 'standby');
                await this.setCapabilityValue('vacuumcleaner_state', currentState);
            }

            if (workMode) {
                await this.setCapabilityValue('measure_work_mode', workMode);
            }

            if (EUFY_CLEAN_LEGACY_CLEAN_SPEED.some((l) => l.toLowerCase() === cleanSpeed) && this.hasCapability('action_clean_speed')) {
                
                if(this.hasCapability('action_clean_speed')) {
                    await this.removeCapability('action_clean_speed');
                    this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - cleanSpeed - removing action_clean_speed`);
                }
            } else {
                await this.setCapabilityValue('action_clean_speed', `${cleanSpeed}`);
            }

            if (cleanSpeed) {
                await this.setCapabilityValue('measure_clean_speed', `${EUFY_CLEAN_GET_CLEAN_SPEED[cleanSpeed]}`);
            }

            if (typeof errorCode === 'number') {
                await this.setCapabilityValue('measure_error', EUFY_CLEAN_ERROR_CODES[errorCode]);
            } else {
                await this.setCapabilityValue('measure_error', !errorCode ? 'no_error' : errorCode);
            }

            await this.setAvailable();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {
            const REFRESH_INTERVAL = 6000;

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);

            await this.setCapabilityValues();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async _onVacuumCapabilityChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged =>`, value);
        try {
            switch (value) {
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CLEANING:
                    return await this.eufyRoboVac.play();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.SPOT_CLEANING:
                    return await this.eufyRoboVac.roomClean();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.DOCKED:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CHARGING:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.STOPPED:
                    return await this.eufyRoboVac.stop();
                default:
                    this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => received unknown value:`, value);
            }
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => error`, err);
            this.log('_onVacuumCapabilityChanged() -> error', err);
        }
    }

    async _onControlModeChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged =>`, value);
        try {
            switch (value) {
                case 'AUTO_CLEAN':
                    return await this.eufyRoboVac.autoClean();
                case 'ROOM_CLEAN':
                    throw new Error('Room clean is not supported yet')
                    return await this.eufyRoboVac.roomClean();
                case 'SPOT_CLEAN':
                    throw new Error('Spot clean is not supported yet')
                    return await this.eufyRoboVac.spotClean();
                case 'GO_HOME':
                    return await this.eufyRoboVac.goHome();
                case 'PAUSE':
                    return await this.eufyRoboVac.pause();
                case 'STOP':
                    return await this.eufyRoboVac.stop();
                case 'PLAY':
                    return await this.eufyRoboVac.play();
                default:
                    this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged => received unknown value:`, value);
            }
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged => error`, err);
            this.log('_onControlModeChanged() -> error', err);
        }
    }

    async _onVacuumCapabilityChanged(value, ...opts) {
        this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged =>`, value);
        console.log('opts', opts);
        try {
            switch (value) {
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CLEANING:
                    return await this.eufyRoboVac.play();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.SPOT_CLEANING:
                    return await this.eufyRoboVac.roomClean();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.DOCKED:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CHARGING:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.STOPPED:
                    return await this.eufyRoboVac.stop();
                default:
                    this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => received unknown value:`, value);
            }
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => error`, err);
            this.log('_onVacuumCapabilityChanged() -> error', err);
        }
    }

    async _onCleanSpeedChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onCleanSpeedChanged =>`, value);
        try {
            return await this.eufyRoboVac.setCleanSpeed(value);
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onCleanSpeedChanged => error`, err);
            this.log('_onCleanSpeedChanged() -> error', err);
        }
    }
};
