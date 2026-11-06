import { attributesModule, classModule, init } from "snabbdom";

import Ctrl from "./ctrl";
import type { Env } from "./interfaces";
import { registerMultipleSelect } from "./multipleSelect";
import { view } from "./view";

const patch = init([classModule, attributesModule]);

registerMultipleSelect();

export function initModule(opts: Env) {
  const element = document.getElementById("insight")!;
  const ctrl = new Ctrl(opts, element, redraw);
  if (opts.ui.focused)
    Object.assign($.fn.multipleSelectDefaults, {
      selectAllText: opts.i18n.SelectAll,
      allSelected: opts.i18n.AllSelected,
      countSelected: opts.i18n.CountSelected,
      noMatchesFound: opts.i18n.NoMatches,
    });

  const blueprint = view(ctrl);
  let vnode = patch(element, blueprint);

  // Wait until vnode has been initialized to call askQuestion because
  // askQuestion can call redraw
  ctrl.askQuestion();

  function redraw() {
    vnode = patch(vnode, view(ctrl));
  }

  return ctrl;
}
