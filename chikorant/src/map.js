// Compatibility shim: the ZYOIN HQ map now lives in src/maps/zyoin.js and every playable map is
// registered in src/maps/index.js (read that file for the map interface contract).
export { buildZyoinMap as buildMap, makeCat } from './maps/zyoin.js';
