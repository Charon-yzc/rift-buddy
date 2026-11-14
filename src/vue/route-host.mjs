// Persistent host for Vue-managed routes inside the legacy renderer.
//
// The legacy renderer replaces large shell regions with innerHTML on every
// state change. A Vue app mounted inside such a region would be destroyed by
// that replacement. This host avoids rebuilding the app: it parses the new
// shell off-DOM, moves the live mount container into the new shell's slot,
// swaps the shells, then updates a shallow reactive state. Vue's keyed diff
// keeps card DOM nodes (and their disclosure/scroll state) across updates.
//
// On navigation to a non-Vue route, unmount before replacing the shell.
import {createApp, h, shallowRef} from '../generated/vue.runtime.mjs';
import FavoriteList from '../generated/FavoriteList.mjs';
import HistoryCards from '../generated/HistoryCards.mjs';

const COMPONENTS = {favorites: FavoriteList, history: HistoryCards};

export function createVueRouteHost() {
  let app = null;
  let host = null;
  let current = null;
  const state = shallowRef({});

  function ensureHost(route) {
    if (!host) {
      host = document.createElement('div');
    }
    host.setAttribute('data-vue-host', route);
    return host;
  }

  function unmount() {
    try {
      app?.unmount();
    } finally {
      app = null;
      host?.remove();
      host = null;
      current = null;
      state.value = {};
    }
  }

  function render(root, shell, {route, props} = {}) {
    const Component = COMPONENTS[route];
    if (!Component) {
      unmount();
      root.innerHTML = shell;
      return {mounted: false};
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = shell;
    const frag = tpl.content;
    const slot = frag.querySelector(`[data-vue-route="${route}"]`);
    if (!slot) {
      if(route!=='history')throw Error(`Missing Vue route slot: ${route}`);
      // A loading or empty history tab has no card list. Keep the app (and the
      // other tabs' kept-alive cards) detached until a list returns.
      if(current&&current!==route)unmount();
      host?.remove();root.innerHTML=shell;return {mounted:false};
    }
    if (current && current !== route) unmount();
    const live = ensureHost(route);
    const focused = live.contains(document.activeElement) ? document.activeElement : null;
    slot.replaceWith(live);
    root.replaceChildren(frag);
    state.value = props||{};
    if (!app) {
      current = route;
      app = createApp({render: () => h(Component, state.value)});
      app.mount(live);
    }
    if (focused?.isConnected) focused.focus({preventScroll: true});
    return {mounted: true};
  }

  function update(route,props){
    if(!app||current!==route||!host?.isConnected)return false;
    state.value=props;return true;
  }
  return {render, update, unmount, get current() { return current; }};
}
