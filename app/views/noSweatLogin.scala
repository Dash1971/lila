package views

import lila.core.i18n.I18nKey

import lila.app.UiEnv.{ *, given }

object noSweatLogin:
  def apply()(using Context) =
    Page(I18nKey.unchecked("muteSignIn").txt())
      .css("bits.auth")
      .headAppend(link(rel := "stylesheet", href := s"${assetPath("nosweat/nostr.css")}?v=key-backup2"))
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=auth-i18n", defer)):
        main(cls := "auth auth-login box box-pad")(
          div(cls := "auth__brand")(
            img(
              cls := "nosweat-login-wordmark nosweat-dark",
              src := assetPath("nosweat/wordmark.svg"),
              alt := "Mute Chess"
            ),
            img(
              cls := "nosweat-login-wordmark nosweat-light",
              src := assetPath("nosweat/wordmark-light.svg"),
              alt := "Mute Chess"
            )
          ),
          h1(I18nKey.unchecked("muteSignInOrJoin").txt()),
          p(cls := "nostr-intro")(
            I18nKey.unchecked("muteLoginIntro")(
              a(href := "https://nostr.org/", targetBlank, rel := "noopener noreferrer")("Nostr")
            )
          ),
          details(cls := "nostr-guide")(
            summary(I18nKey.unchecked("muteNewToNostr")()),
            p(
              I18nKey.unchecked("muteLoginIdentity")(
                a(href := "https://nostr.org/", targetBlank, rel := "noopener noreferrer")("Nostr")
              )
            ),
            p(I18nKey.unchecked("muteLoginSignerHelp")()),
            p(I18nKey.unchecked("muteLoginSameIdentity")())
          ),
          div(id := "nostr-methods", cls := "form3")(
            button(id := "nostr-generate", cls := "button button-green")(
              I18nKey.unchecked("muteCreateKey").txt()
            ),
            div(id := "nostr-created", hidden)(
              p(
                I18nKey.unchecked("muteAuthBackupHelp").txt()
              ),
              input(
                id := "nostr-backup",
                cls := "form-control",
                tpe := "password",
                readonly,
                autocomplete := "off",
                aria.label := I18nKey.unchecked("muteAuthNewSecret").txt()
              ),
              div(cls := "nostr-key-actions")(
                button(
                  id := "nostr-copy",
                  cls := "button button-metal",
                  aria.live := "polite",
                  attr("data-copied") := I18nKey.unchecked("muteCopied").txt(),
                  attr("data-copy-failed") := I18nKey.unchecked("muteCopyKeyFailed").txt()
                )(I18nKey.unchecked("muteCopyKey").txt()),
                button(id := "nostr-download", cls := "button button-metal")(
                  I18nKey.unchecked("muteDownloadKey").txt()
                ),
                button(
                  id := "nostr-reveal",
                  cls := "button button-empty",
                  attr("data-show-key") := I18nKey.unchecked("muteShowKey").txt(),
                  attr("data-hide-key") := I18nKey.unchecked("muteHideKey").txt()
                )(I18nKey.unchecked("muteShowKey").txt())
              ),
              label(cls := "form-label", `for` := "nostr-username")(I18nKey.unchecked("muteUserName").txt()),
              input(
                id := "nostr-username",
                cls := "form-control",
                maxlength := 20,
                autocomplete := "username"
              ),
              button(id := "nostr-create-login", cls := "button button-green")(
                I18nKey.unchecked("muteSaveKeyAndPlay").txt()
              )
            ),
            p(cls := "nostr-help")(
              I18nKey.unchecked("muteAuthRememberHelp").txt()
            ),
            div(id := "nostr-saved", hidden)(
              button(id := "nostr-use-saved", cls := "button")(I18nKey.unchecked("muteContinueSaved").txt()),
              details(cls := "nostr-guide")(
                summary(I18nKey.unchecked("muteAuthBackupSaved").txt()),
                p(I18nKey.unchecked("muteAuthBackupOptions").txt()),
                div(cls := "nostr-key-actions")(
                  button(
                    id := "nostr-copy-saved",
                    cls := "button button-metal",
                    aria.live := "polite",
                    attr("data-copied") := I18nKey.unchecked("muteCopied").txt(),
                    attr("data-copy-failed") := I18nKey.unchecked("muteCopyKeyFailed").txt()
                  )(
                    I18nKey.unchecked("muteCopyKey").txt()
                  ),
                  button(id := "nostr-download-saved", cls := "button button-metal")(
                    I18nKey.unchecked("muteDownloadKey").txt()
                  )
                )
              ),
              button(id := "nostr-forget", cls := "button button-empty")(
                I18nKey.unchecked("muteForgetSaved").txt()
              )
            ),
            div(cls := "or-separator")(span(I18nKey.unchecked("muteAuthAlreadyNostr").txt())),
            button(id := "nostr-extension", cls := "button button-metal")(
              I18nKey.unchecked("muteSigner").txt()
            ),
            p(cls := "nostr-help")(
              I18nKey.unchecked("muteAuthSignerLink")(
                a(
                  href := "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp",
                  targetBlank,
                  rel := "noopener noreferrer"
                )("nos2x (Chrome / Chromium)")
              )
            ),
            label(cls := "form-label", `for` := "nostr-nsec")(I18nKey.unchecked("muteExistingKey").txt()),
            input(
              id := "nostr-nsec",
              cls := "form-control",
              tpe := "password",
              autocomplete := "off",
              spellcheck := "false",
              placeholder := "nsec1…"
            ),
            button(id := "nostr-import", cls := "button button-metal")(
              I18nKey.unchecked("muteImportKey").txt()
            ),
            details(cls := "nostr-guide")(
              summary(I18nKey.unchecked("muteAuthKeepAccess").txt()),
              p(
                I18nKey.unchecked("muteAuthClearingData").txt()
              ),
              p(
                I18nKey.unchecked("muteAuthStorageHelp").txt()
              ),
              button(id := "nostr-persist", cls := "button button-empty")(
                I18nKey.unchecked("muteAuthRequestStorage").txt()
              ),
              p(
                I18nKey.unchecked("muteAuthPasswordManager").txt()
              ),
              p(I18nKey.unchecked("muteAuthPlaintext").txt())
            )
          ),
          div(id := "nostr-second-factor", cls := "form3", hidden)(
            h2(I18nKey.unchecked("muteAuthOneMore").txt()),
            p(I18nKey.unchecked("tfa:twoFactorEnabled").txt()),
            label(cls := "form-label", `for` := "nostr-token")(
              I18nKey.unchecked("muteAuthFactorToken").txt()
            ),
            input(
              id := "nostr-token",
              cls := "form-control",
              autocomplete := "one-time-code",
              maxlength := 64
            ),
            button(id := "nostr-verify", cls := "button button-green")(I18nKey.unchecked("muteSignIn").txt()),
            button(id := "nostr-back", cls := "button button-empty")(
              I18nKey.unchecked("muteAuthDifferentKey").txt()
            )
          ),
          p(
            id := "nostr-status",
            attr("data-downloaded") := I18nKey.unchecked("muteAuthDownloaded").txt(),
            attr("data-no-key") := I18nKey.unchecked("muteAuthNoKey").txt(),
            attr("data-need-signer") := I18nKey.unchecked("muteAuthNeedSigner").txt(),
            attr("data-create-first") := I18nKey.unchecked("muteAuthCreateFirst").txt(),
            attr("data-granted") := I18nKey.unchecked("muteAuthGranted").txt(),
            attr("data-denied") := I18nKey.unchecked("muteAuthDenied").txt(),
            attr("data-unsupported") := I18nKey.unchecked("muteAuthUnsupported").txt(),
            attr("data-bad-key") := I18nKey.unchecked("muteAuthBadKey").txt(),
            attr("data-removed") := I18nKey.unchecked("muteAuthRemoved").txt(),
            attr("data-enter-code") := I18nKey.unchecked("muteAuthEnterCode").txt(),
            attr("data-failure") := I18nKey.unchecked("muteAuthFailure").txt(),
            attr("data-invalid-code") := I18nKey.unchecked("muteAuthInvalidCode").txt(),
            attr("data-busy") := I18nKey.unchecked("muteAuthPleaseWait").txt(),
            attr("data-bad-name") := I18nKey.unchecked("muteAuthBadName").txt(),
            attr("data-account-unavailable") := I18nKey.unchecked("muteAuthAccountUnavailable").txt(),
            attr("data-name-unavailable") := I18nKey.unchecked("usernameAlreadyUsed").txt(),
            role := "status",
            aria.live := "polite"
          ),
          p(cls := "nostr-help")(
            I18nKey.unchecked("muteAuthPrivacy").txt()
          ),
          a(href := "/")(I18nKey.unchecked("mutePlayAnon").txt())
        )
