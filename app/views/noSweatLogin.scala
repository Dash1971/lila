package views

import lila.core.i18n.I18nKey

import lila.app.UiEnv.{ *, given }

object noSweatLogin:
  def apply()(using Context) =
    Page(I18nKey("muteSignIn").txt())
      .css("bits.auth")
      .headAppend(link(rel := "stylesheet", href := s"${assetPath("nosweat/nostr.css")}?v=key-backup2"))
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=key-copy3", defer)):
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
          h1(I18nKey("muteSignInOrJoin").txt()),
          p(cls := "nostr-intro")(
            I18nKey("muteLoginIntro")(
              a(href := "https://nostr.org/", targetBlank, rel := "noopener noreferrer")("Nostr")
            )
          ),
          details(cls := "nostr-guide")(
            summary(I18nKey("muteNewToNostr")()),
            p(
              I18nKey("muteLoginIdentity")(
                a(href := "https://nostr.org/", targetBlank, rel := "noopener noreferrer")("Nostr")
              )
            ),
            p(I18nKey("muteLoginSignerHelp")()),
            p(I18nKey("muteLoginSameIdentity")())
          ),
          div(id := "nostr-methods", cls := "form3")(
            button(id := "nostr-generate", cls := "button button-green")(I18nKey("muteCreateKey").txt()),
            div(id := "nostr-created", hidden)(
              p(
                "Save a copy of this key so you can return on another device. A password manager is a good place for it; anyone with the key can use this identity."
              ),
              input(
                id := "nostr-backup",
                cls := "form-control",
                tpe := "password",
                readonly,
                autocomplete := "off",
                aria.label := "Your new Nostr secret key"
              ),
              div(cls := "nostr-key-actions")(
                button(
                  id := "nostr-copy",
                  cls := "button button-metal",
                  aria.live := "polite",
                  attr("data-copied") := I18nKey("muteCopied").txt(),
                  attr("data-copy-failed") := I18nKey("muteCopyKeyFailed").txt()
                )(I18nKey("muteCopyKey").txt()),
                button(id := "nostr-download", cls := "button button-metal")(
                  I18nKey("muteDownloadKey").txt()
                ),
                button(
                  id := "nostr-reveal",
                  cls := "button button-empty",
                  attr("data-show-key") := I18nKey("muteShowKey").txt(),
                  attr("data-hide-key") := I18nKey("muteHideKey").txt()
                )(I18nKey("muteShowKey").txt())
              ),
              label(cls := "form-label", `for` := "nostr-username")(I18nKey("muteUserName").txt()),
              input(
                id := "nostr-username",
                cls := "form-control",
                maxlength := 20,
                autocomplete := "username"
              ),
              button(id := "nostr-create-login", cls := "button button-green")(
                I18nKey("muteSaveKeyAndPlay").txt()
              )
            ),
            p(cls := "nostr-help")(
              "This browser remembers your key between visits, as long as its site data is kept. Keep a separate backup."
            ),
            div(id := "nostr-saved", hidden)(
              button(id := "nostr-use-saved", cls := "button")(I18nKey("muteContinueSaved").txt()),
              details(cls := "nostr-guide")(
                summary("Back up your saved key"),
                p("Copy it to your password manager or download a private .txt copy."),
                div(cls := "nostr-key-actions")(
                  button(
                    id := "nostr-copy-saved",
                    cls := "button button-metal",
                    aria.live := "polite",
                    attr("data-copied") := I18nKey("muteCopied").txt(),
                    attr("data-copy-failed") := I18nKey("muteCopyKeyFailed").txt()
                  )(
                    I18nKey("muteCopyKey").txt()
                  ),
                  button(id := "nostr-download-saved", cls := "button button-metal")(
                    I18nKey("muteDownloadKey").txt()
                  )
                )
              ),
              button(id := "nostr-forget", cls := "button button-empty")(I18nKey("muteForgetSaved").txt())
            ),
            div(cls := "or-separator")(span("Already use Nostr?")),
            button(id := "nostr-extension", cls := "button button-metal")(
              I18nKey("muteSigner").txt()
            ),
            p(cls := "nostr-help")(
              "Already have a signer? Continue directly. Or install ",
              a(
                href := "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp",
                targetBlank,
                rel := "noopener noreferrer"
              )("nos2x for Chrome / Chromium"),
              ". Other compatible Nostr signers work too."
            ),
            label(cls := "form-label", `for` := "nostr-nsec")(I18nKey("muteExistingKey").txt()),
            input(
              id := "nostr-nsec",
              cls := "form-control",
              tpe := "password",
              autocomplete := "off",
              spellcheck := "false",
              placeholder := "nsec1…"
            ),
            button(id := "nostr-import", cls := "button button-metal")(I18nKey("muteImportKey").txt()),
            details(cls := "nostr-guide")(
              summary("Keeping access to your key"),
              p(
                "Clearing site data, a new browser or profile, or another device needs your original key or signer. Private browsing may remove the key when you close it. Browser storage is not a backup."
              ),
              p(
                "You can ask this browser to keep site data for longer. It decides whether to allow this, and you can still clear it yourself."
              ),
              button(id := "nostr-persist", cls := "button button-empty")("Ask browser to keep site data"),
              p(
                "For a password manager, add an entry for mutechess.org and paste the copied nsec into its password field or secure note. In Apple Passwords, save it as the password; iCloud Keychain can sync the entry when enabled. Copy that same key back here to restore access."
              ),
              p("The .txt download contains your key as plain text. Keep it somewhere private.")
            )
          ),
          div(id := "nostr-second-factor", cls := "form3", hidden)(
            h2("One more step"),
            p("Two-factor authentication is enabled for this account."),
            label(cls := "form-label", `for` := "nostr-token")("Authenticator or recovery code"),
            input(
              id := "nostr-token",
              cls := "form-control",
              autocomplete := "one-time-code",
              maxlength := 64
            ),
            button(id := "nostr-verify", cls := "button button-green")(I18nKey("muteSignIn").txt()),
            button(id := "nostr-back", cls := "button button-empty")("Use a different key")
          ),
          p(id := "nostr-status", role := "status", aria.live := "polite"),
          p(cls := "nostr-help")(
            "Your secret key stays in your browser. Signing in does not post anything to Nostr."
          ),
          a(href := "/")(I18nKey("mutePlayAnon").txt())
        )
