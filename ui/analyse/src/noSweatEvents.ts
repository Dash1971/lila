import { type Hooks, type VNode } from 'lib/view/snabbdom';

// Native bind() installs only once. Candidate actions change as the report progresses.
export const reviewClick = (action: (event: MouseEvent) => void): Hooks => {
  const attach = (vnode: VNode) => {
    (vnode.elm as HTMLElement | SVGElement).onclick = action;
  };
  return { insert: attach, update: (_, vnode) => attach(vnode) };
};
