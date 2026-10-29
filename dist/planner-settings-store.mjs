export const plannerSettingsKey='time-atlas-v1';

/** A failed browser-storage write must leave the previous saved settings intact. */
export function writePlannerSettings(storageOrGetter,settings){
  try{
    const storage=typeof storageOrGetter==='function'?storageOrGetter():storageOrGetter;
    if(typeof storage?.setItem!=='function')return false;
    storage.setItem(plannerSettingsKey,JSON.stringify({selected:settings.selected,base:settings.base,schedules:settings.schedules}));
    return true;
  }catch{return false;}
}
