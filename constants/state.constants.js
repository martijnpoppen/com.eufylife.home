exports.GET_STATE = {
  Sleeping: "stopped",
  standby: "stopped",
  Recharge: "docked",
  Running: "cleaning",
  spot: "spot_cleaning",
  completed: "docked",
  Charging: "charging",
};

exports.VACUUMCLEANER_STATE = {
  STOPPED: 'stopped',
  CLEANING: 'cleaning',
  SPOT_CLEANING: 'spot_cleaning',
  DOCKED: 'docked',
  CHARGING: 'charging',
};