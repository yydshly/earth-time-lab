const valid=value=>typeof value==='string'&&/^[a-f0-9]{12}$/.test(value);

/** The loaded build stays fixed; checking a newer release never advances it. */
export function observeAppVersion(previous={},response){
  const state={loadedVersion:valid(previous.loadedVersion)?previous.loadedVersion:null,availableVersion:valid(previous.availableVersion)?previous.availableVersion:null};
  if(response?.app!=='earth-time-lab'||!valid(response.version))return {...state,updateAvailable:!!state.loadedVersion&&!!state.availableVersion&&state.loadedVersion!==state.availableVersion,accepted:false};
  if(!state.loadedVersion)state.loadedVersion=response.version;
  state.availableVersion=response.version;
  return {...state,updateAvailable:state.loadedVersion!==state.availableVersion,accepted:true};
}
