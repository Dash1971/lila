package views

import lila.app.UiEnv.{ *, given }

object noSweatSecurity:
  def apply(user: User)(using Context) =
    val enabled = user.totpSecret.isDefined
    def signerButtons = frag(
      button(tpe := "button", cls := "button button-green", attr("data-security-signer") := "extension")(
        if enabled then "Sign and disable 2FA" else "Sign and enable 2FA"
      ),
      button(tpe := "button", cls := "button button-metal", attr("data-security-signer") := "saved", hidden)(
        "Use saved browser key"
      )
    )
    account.ui
      .AccountPage("Two-factor authentication", "twofactor")
      .headAppend(script(src := assetPath("nosweat/nostr.js"), defer)):
        div(
          id := "nostr-security",
          cls := "box box-pad form3",
          attr("data-enabled") := enabled.toString,
          attr("data-account") := user.username.value
        )(
          h1("Two-factor authentication"),
          p(id := "nostr-security-state")(if enabled then "Two-factor authentication is enabled."
          else "Two-factor authentication is disabled."),
          p(
            "Nostr is your first factor. An authenticator app adds a six-digit code when you sign in. A NIP-07 browser signer is recommended."
          ),
          p(
            "Changing this setting requires a fresh signature from your account’s Nostr key and signs out your other sessions."
          ),
          (!enabled).option(
            button(id := "nostr-security-setup", tpe := "button", cls := "button")("Set up authenticator")
          ),
          div(id := "nostr-security-enroll", hidden)(
            h2("Add to your authenticator"),
            p("Scan this QR code or enter the setup key manually."),
            canvas(id := "nostr-security-qr", cls := "qrcode", aria.label := "Authenticator setup QR code"),
            p("Setup key: ", code(id := "nostr-security-secret")),
            (!enabled).option(
              frag(
                label(`for` := "nostr-security-token")("Authenticator code"),
                input(
                  id := "nostr-security-token",
                  cls := "form-control",
                  autocomplete := "one-time-code",
                  maxlength := 64
                ),
                signerButtons
              )
            )
          ),
          enabled.option(
            div(id := "nostr-security-disable")(
              h2("Disable two-factor authentication"),
              label(`for` := "nostr-security-token")("Authenticator or unused recovery code"),
              input(
                id := "nostr-security-token",
                cls := "form-control",
                autocomplete := "one-time-code",
                maxlength := 64
              ),
              signerButtons
            )
          ),
          p(id := "nostr-security-status", role := "status", aria.live := "polite"),
          div(id := "nostr-security-recovery", hidden)(
            h2("Save your recovery codes"),
            p(
              "Each code works once, together with your Nostr key. Store them somewhere safe outside this browser. You cannot view them again."
            ),
            textarea(
              id := "nostr-security-codes",
              cls := "form-control",
              readonly,
              rows := 8,
              autocomplete := "off"
            ),
            a(href := "/club/security", cls := "button")("I saved my recovery codes")
          ),
          a(id := "nostr-security-done", href := "/club/security", cls := "button", hidden)("Done")
        )
