exports.GET_STATE = {
  Sleeping: "stopped",
  standby: "stopped",
  Running: "cleaning",
  spot: "spot_cleaning",
  completed: "docked",
  Charging: "charging",
};

exports.SET_STATE = {
  stopped: "Sleeping",
  stopped: "standby",
  cleaning: "Running",
  spot_cleaning: "spot",
  docked: "completed",
  charging: "Charging",
};
