import { text } from "./text";
import { h } from "snabbdom";

import { numberFormat } from "lib/i18n";
import { onInsert, spinnerHtml } from "lib/view";
import { userLink } from "lib/view/userLink";

import type Ctrl from "./ctrl";
import { registerFormHandler } from "./insight.refresh";

const shareStates = ["nobody", "friends only", "everybody"];

export function tutor() {
  return h(
    "a.tutor-link",
    {
      attrs: { href: "/tutor" },
    },
    [
      h("img", {
        attrs: { src: site.asset.flairSrc("nature.octopus-howard") },
      }),
      h("span", [
        h("strong", "Try out Tutor"),
        h("em", "Compare to your peers!"),
      ]),
    ],
  );
}

export function info(ctrl: Ctrl) {
  const shareText = text(
    ctrl,
    ["SharedNobody", "SharedFriends", "SharedEverybody"][ctrl.user.shareId],
    "Shared with " + shareStates[ctrl.user.shareId] + ".",
  );
  return h("div.info.box", [
    h("div.top", userLink(ctrl.user)),
    h("div.content", [
      h(
        "p",
        ctrl.ui.focused
          ? text(ctrl, "Summary", "")
          : [
              "Insights over ",
              h("strong", numberFormat(ctrl.user.nbGames)),
              " rated games.",
            ],
      ),
      ctrl.ui.focused && h("p", text(ctrl, "BasicNotice", "")),
      h(
        "p.share",
        ctrl.own
          ? h(
              "a",
              {
                attrs: {
                  href: "/account/preferences/privacy#shareYourInsightsData",
                  target: "_blank",
                },
              },
              shareText,
            )
          : shareText,
      ),
    ]),
    h(
      "div.refresh",
      ctrl.env.user.stale && (!ctrl.ui.focused || ctrl.own)
        ? h("div.insight-stale", [
            h(
              "p",
              text(ctrl, "NewGames", "There are new games to learn from!"),
            ),
            h(
              "form.insight-refresh",
              {
                attrs: {
                  action: `/insights/refresh/${ctrl.env.user.id}`,
                  method: "post",
                },
                hook: onInsert(registerFormHandler),
              },
              [
                h(
                  "button.button.button-thin",
                  text(ctrl, "Update", "Update insights"),
                ),
                h(
                  "div.crunching.none",
                  {
                    hook: onInsert((el) =>
                      el.insertAdjacentHTML("afterbegin", spinnerHtml),
                    ),
                  },
                  [
                    h("br"),
                    h(
                      "p",
                      h(
                        "strong",
                        text(
                          ctrl,
                          "Crunching",
                          "Now crunching data just for you!",
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ])
        : null,
    ),
  ]);
}
