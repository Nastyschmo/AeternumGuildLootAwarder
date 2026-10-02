// Globals that come from <script> tags outside js/*.js.

// Firebase compat SDK (loaded from gstatic.com in index.html). Typed
// loosely on purpose — pulling in the full firebase package just for its
// types isn't worth a node_modules dependency for a no-build site.
declare const firebase: any;
