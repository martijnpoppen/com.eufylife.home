"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoboVac = exports.WorkMode = exports.Direction = exports.WorkStatus = exports.ErrorCode = exports.CleanSpeed = void 0;
const tuyapi_1 = __importDefault(require("tuyapi"));
var CleanSpeed;
(function (CleanSpeed) {
    CleanSpeed["NO_SUCTION"] = "No_suction";
    CleanSpeed["STANDARD"] = "Standard";
    CleanSpeed["BOOST_IQ"] = "Boost_IQ";
    CleanSpeed["MAX"] = "Max";
})(CleanSpeed = exports.CleanSpeed || (exports.CleanSpeed = {}));
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["NO_ERROR"] = "no_error";
    ErrorCode["WHEEL_STUCK"] = "Wheel_stuck";
    ErrorCode["R_BRUSH_STUCK"] = "R_brush_stuck";
    ErrorCode["CRASH_BAR_STUCK"] = "Crash_bar_stuck";
    ErrorCode["SENSOR_DIRTY"] = "sensor_dirty";
    ErrorCode["NOT_ENOUGH_POWER"] = "N_enough_pow";
    ErrorCode["STUCK_5_MIN"] = "Stuck_5_min";
    ErrorCode["FAN_STUCK"] = "Fan_stuck";
    ErrorCode["S_BRUSH_STUCK"] = "S_brush_stuck";
})(ErrorCode = exports.ErrorCode || (exports.ErrorCode = {}));
var WorkStatus;
(function (WorkStatus) {
    // Cleaning
    WorkStatus["RUNNING"] = "Running";
    // In the dock, charging
    WorkStatus["CHARGING"] = "Charging";
    // Not in the dock, paused
    WorkStatus["STAND_BY"] = "standby";
    // Not in the dock - goes into this state after being paused for a while
    WorkStatus["SLEEPING"] = "Sleeping";
    // Going home because battery is depleted
    WorkStatus["RECHARGE_NEEDED"] = "Recharge";
    // In the dock, full charged
    WorkStatus["COMPLETED"] = "completed";
})(WorkStatus = exports.WorkStatus || (exports.WorkStatus = {}));
var Direction;
(function (Direction) {
    Direction["LEFT"] = "left";
    Direction["RIGHT"] = "right";
    Direction["FORWARD"] = "forward";
    Direction["BACKWARD"] = "backward";
})(Direction = exports.Direction || (exports.Direction = {}));
var WorkMode;
(function (WorkMode) {
    WorkMode["AUTO"] = "auto";
    WorkMode["NO_SWEEP"] = "Nosweep";
    WorkMode["SMALL_ROOM"] = "SmallRoom";
    WorkMode["EDGE"] = "Edge";
    WorkMode["SPOT"] = "Spot";
})(WorkMode = exports.WorkMode || (exports.WorkMode = {}));
class RoboVac {
    constructor(config, debugLog = false, timeoutDuration = 2) {
        this.PLAY_PAUSE = '2';
        this.DIRECTION = '3';
        this.WORK_MODE = '5';
        this.WORK_STATUS = '15';
        this.GO_HOME = '101';
        this.CLEAN_SPEED = '102';
        this.FIND_ROBOT = '103';
        this.BATTERY_LEVEL = '104';
        this.ERROR_CODE = '106';
        this.connected = false;
        this.statuses = null;
        this.lastStatusUpdate = null;
        this.maxStatusUpdateAge = 1000 * (1 * 30); //30 Seconds
        this.debugLog = debugLog;
        if (!config.deviceId) {
            throw new Error('You must pass through deviceId');
        }
        this.api = new tuyapi_1.default({
            id: config.deviceId,
            key: config.localKey,
            ip: config.ip,
            port: config.port,
            version: '3.3',
            issueRefreshOnConnect: true,
            issueGetOnConnect: true,
            nullPayloadOnJSONError: true
        });
        this.timeoutDuration = timeoutDuration;
        this.api.on('error', (error) => {
            if (debugLog) {
                console.error('Robovac Error', JSON.stringify(error, null, 4));
            }
        });
        this.api.on('connected', () => {
            this.connected = true;
            if (debugLog) {
                console.log("Connected!");
            }
        });
        this.api.on('disconnected', () => {
            this.connected = false;
            if (debugLog) {
                console.log('Disconnected!');
            }
        });
        this.api.on('dp-refresh', data => {
            if (debugLog) {
                console.log('DP_REFRESH data from device: ', data);
                console.log('Status Updated!');
            }
        });
        this.api.on('data', (data) => {
            if (debugLog) {
                console.log('Data from device:', data);
                console.log('Status Updated!');
            }
        });
    }
    async connect() {
        if (!this.connected) {
            if (this.debugLog) {
                console.log('Connecting...');
            }
            await this.api.connect();
        }
    }
    async disconnect() {
        if (this.debugLog) {
            console.log('Disconnecting...');
        }
        await this.api.disconnect();
    }
    async doWork(work) {
        if (!this.api.device.id || !this.api.device.ip) {
            if (this.debugLog) {
                console.log('Looking for device...');
            }
            try {
                await this.api.find({ timeout: this.timeoutDuration });
                if (this.debugLog) {
                    console.log(`Found device ${this.api.device.id} at ${this.api.device.ip}`);
                }
            }
            catch (err) {
                console.log(err);
            }
        }
        await this.connect();
        return await work();
    }
    async getStatuses(force = false) {
        if (force || (new Date()).getTime() - this.lastStatusUpdate > this.maxStatusUpdateAge) {
            return await this.doWork(async () => {
                this.statuses = await this.api.get({ schema: true });
                this.lastStatusUpdate = (new Date()).getTime();
                return this.statuses;
            });
        }
        else {
            return this.statuses;
        }
    }
    async getCleanSpeed(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.CLEAN_SPEED];
    }
    async setCleanSpeed(cleanSpeed) {
        await this.doWork(async () => {
            await this.set({
                [this.CLEAN_SPEED]: cleanSpeed
            });
        });
    }
    async getPlayPause(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.PLAY_PAUSE];
    }
    async setPlayPause(state) {
        await this.doWork(async () => {
            await this.set({
                [this.PLAY_PAUSE]: state
            });
        });
    }
    async play() {
        await this.setPlayPause(true);
    }
    async pause() {
        await this.setPlayPause(false);
    }
    async getWorkMode(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.WORK_MODE];
    }
    async setWorkMode(workMode) {
        await this.doWork(async () => {
            if (this.debugLog) {
                console.log(`Setting WorkMode to ${workMode}`);
            }
            await this.set({
                [this.WORK_MODE]: workMode
            });
        });
    }
    async startCleaning(force = false) {
        if (this.debugLog) {
            console.log('Starting Cleaning', JSON.stringify(await this.getStatuses(force), null, 4));
        }
        await this.setWorkMode(WorkMode.AUTO);
        if (this.debugLog) {
            console.log('Cleaning Started!');
        }
    }
    async getWorkStatus(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.WORK_STATUS];
    }
    async setWorkStatus(workStatus) {
        await this.doWork(async () => {
            await this.set({
                [this.WORK_STATUS]: workStatus
            });
        });
    }
    async goHome() {
        await this.doWork(async () => {
            await this.set({
                [this.GO_HOME]: true
            });
        });
    }
    async setFindRobot(state) {
        return await this.doWork(async () => {
            await this.set({
                [this.FIND_ROBOT]: state
            });
        });
    }
    async getFindRobot(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.FIND_ROBOT];
    }
    async getBatteyLevel(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.BATTERY_LEVEL];
    }
    async getErrorCode(force = false) {
        let statuses = await this.getStatuses(force);
        return statuses.dps[this.ERROR_CODE];
    }
    async set(data) {
        if (this.debugLog) {
            console.log(`Setting: ${JSON.stringify(data, null, 4)}`);
        }
        return await this.api.set({
            multiple: true,
            data: data,
            shouldWaitForResponse: true
        });
    }
    formatStatus() {
        console.log(`
		-- Status Start --
		 - Play/Pause: ${this.statuses.dps[this.PLAY_PAUSE]}
		 - Direction: ${this.statuses.dps[this.DIRECTION]}
		 - Work Mode: ${this.statuses.dps[this.WORK_MODE]}
		 - Go Home: ${this.statuses.dps[this.GO_HOME]}
		 - Clean Speed: ${this.statuses.dps[this.CLEAN_SPEED]}
		 - Find Robot: ${this.statuses.dps[this.FIND_ROBOT]}
		 - Battery Level: ${this.statuses.dps[this.BATTERY_LEVEL]}
		 - Error Code: ${this.statuses.dps[this.ERROR_CODE]}
		-- Status End --
		`);
    }
}
exports.RoboVac = RoboVac;
//# sourceMappingURL=index.js.map