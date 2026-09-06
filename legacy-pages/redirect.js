// Preserve old bookmarks without accepting an external redirect destination.
const target = new URL("https://blackvector.win/");
const prefix = "/black-vector-website";
target.pathname = location.pathname.startsWith(`${prefix}/`) || location.pathname === prefix
  ? location.pathname.slice(prefix.length) || "/"
  : location.pathname;
target.search = location.search;
target.hash = location.hash;
location.replace(target.href);
