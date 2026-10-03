// Globals that come from <script> tags outside js/*.js.

// Firebase compat SDK (loaded from gstatic.com in index.html). Typed
// loosely on purpose — pulling in the full firebase package just for its
// types isn't worth a node_modules dependency for a no-build site.
declare const firebase: any;

// Live talent trees from the Forever client, set by the generated
// data/forever/talents.js (merged into TALENT_DATA in data/talentsforever.js).
interface Window {
  FOREVER_TALENT_TREES?: ForeverTalentTrees;
}
