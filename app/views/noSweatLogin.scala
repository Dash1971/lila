package views

import lila.app.UiEnv.{ *, given }

object noSweatLogin:
  def apply()(using Context) =
    Page("Sign in")
      .css("bits.auth")
      .headAppend(link(rel := "stylesheet", href := assetPath("nosweat/nostr.css")))
      .headAppend(script(src := assetPath("nosweat/nostr.js"), defer)):
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
          h1("Sign in with Nostr"),
          p("A browser signer (NIP-07) is recommended. It keeps your private key outside this website."),
          div(cls := "form3")(
            label(cls := "form-label", `for` := "nostr-username")("Username (optional, for new accounts)"),
            input(id := "nostr-username", cls := "form-control", maxlength := 20, autocomplete := "username"),
            label(cls := "form-label", `for` := "nostr-token")("Authenticator or recovery code (if enabled)"),
            input(
              id := "nostr-token",
              cls := "form-control",
              autocomplete := "one-time-code",
              maxlength := 64
            ),
            button(id := "nostr-extension", cls := "button button-green")("Sign in with browser signer"),
            div(id := "nostr-saved", hidden)(
              button(id := "nostr-use-saved", cls := "button")("Sign in with saved key"),
              button(id := "nostr-forget", cls := "button button-empty")("Forget saved key")
            ),
            div(cls := "or-separator")(span("or use a key in this browser")),
            p(cls := "nostr-help")(
              "Browser keys are stored on this device. Website scripts can use them; a signer extension provides better isolation. Back up your nsec before clearing browser data."
            ),
            button(id := "nostr-generate", cls := "button button-metal")("Generate a Nostr key"),
            label(cls := "form-label", `for` := "nostr-nsec")("Import your nsec"),
            input(
              id := "nostr-nsec",
              cls := "form-control",
              tpe := "password",
              autocomplete := "off",
              spellcheck := "false",
              placeholder := "nsec1…"
            ),
            button(id := "nostr-import", cls := "button button-metal")("Save key and sign in"),
            div(id := "nostr-created", hidden)(
              p(
                "Your new key is ready. Save this private backup somewhere safe. Anyone with it can sign in as you."
              ),
              input(
                id := "nostr-backup",
                cls := "form-control",
                tpe := "password",
                readonly,
                autocomplete := "off"
              ),
              button(id := "nostr-reveal", cls := "button button-empty")("Show backup nsec"),
              button(id := "nostr-create-login", cls := "button button-green")("Save key and create account")
            ),
            p(id := "nostr-status", role := "status", aria.live := "polite"),
            p(cls := "nostr-help")(
              "Only your public key and a signed login challenge go to the server. Signing in does not publish to Nostr relays."
            ),
            a(href := "/")("Continue without signing in")
          )
        )
