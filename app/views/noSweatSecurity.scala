package views

import lila.core.i18n.I18nKey

import lila.app.UiEnv.{ *, given }

object noSweatSecurity:
  def apply(user: User)(using Context) =
    val enabled = user.totpSecret.isDefined
    def signerButtons = frag(
      button(tpe := "button", cls := "button button-green", attr("data-security-signer") := "extension")(
        if enabled then I18nKey.unchecked("muteAuthSignDisable").txt()
        else I18nKey.unchecked("muteAuthSignEnable").txt()
      ),
      button(tpe := "button", cls := "button button-metal", attr("data-security-signer") := "saved", hidden)(
        I18nKey.unchecked("muteAuthUseSaved").txt()
      )
    )
    account.ui
      .AccountPage(I18nKey.unchecked("tfa:twoFactorAuth").txt(), "twofactor")
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=auth-i18n", defer)):
        div(
          id := "nostr-security",
          cls := "box box-pad form3",
          attr("data-enabled") := enabled.toString,
          attr("data-account") := user.username.value
        )(
          h1(I18nKey.unchecked("tfa:twoFactorAuth").txt()),
          p(id := "nostr-security-state")(if enabled then I18nKey.unchecked("tfa:twoFactorEnabled").txt()
          else I18nKey.unchecked("muteAuthDisabled").txt()),
          p(
            I18nKey.unchecked("muteAuthFactorHelp").txt()
          ),
          p(
            I18nKey.unchecked("muteAuthChangeHelp").txt()
          ),
          (!enabled).option(
            button(id := "nostr-security-setup", tpe := "button", cls := "button")(
              I18nKey.unchecked("muteAuthSetup").txt()
            )
          ),
          div(id := "nostr-security-enroll", hidden)(
            h2(I18nKey.unchecked("muteAuthAddApp").txt()),
            p(I18nKey.unchecked("muteAuthScanOrType").txt()),
            canvas(
              id := "nostr-security-qr",
              cls := "qrcode",
              aria.label := I18nKey.unchecked("muteAuthQrLabel").txt()
            ),
            p(I18nKey.unchecked("muteAuthSetupKey").txt(), " ", code(id := "nostr-security-secret")),
            (!enabled).option(
              frag(
                label(`for` := "nostr-security-token")(I18nKey.unchecked("tfa:authenticationCode").txt()),
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
              h2(I18nKey.unchecked("tfa:disableTwoFactor").txt()),
              label(`for` := "nostr-security-token")(I18nKey.unchecked("muteAuthUnusedCode").txt()),
              input(
                id := "nostr-security-token",
                cls := "form-control",
                autocomplete := "one-time-code",
                maxlength := 64
              ),
              signerButtons
            )
          ),
          p(
            id := "nostr-security-status",
            attr("data-manual") := I18nKey.unchecked("muteAuthManual").txt(),
            attr("data-no-key") := I18nKey.unchecked("muteAuthNoKey").txt(),
            attr("data-need-signer") := I18nKey.unchecked("muteAuthNeedSigner").txt(),
            attr("data-enter-code") := I18nKey.unchecked("muteAuthEnterCode").txt(),
            attr("data-disabled") := I18nKey.unchecked("muteAuthDisabled").txt(),
            attr("data-save-now") := I18nKey.unchecked("muteAuthSaveNow").txt(),
            attr("data-sessions-closed") := I18nKey.unchecked("muteAuthSessionsClosed").txt(),
            attr("data-failure") := I18nKey.unchecked("muteAuthFailure").txt(),
            attr("data-invalid-code") := I18nKey.unchecked("muteAuthInvalidCode").txt(),
            attr("data-busy") := I18nKey.unchecked("muteAuthPleaseWait").txt(),
            attr("data-wrong-signer") := I18nKey.unchecked("muteAuthWrongSigner").txt(),
            attr("data-reload") := I18nKey.unchecked("muteAuthReload").txt(),
            attr("data-enabled") := I18nKey.unchecked("tfa:twoFactorEnabled").txt(),
            role := "status",
            aria.live := "polite"
          ),
          div(id := "nostr-security-recovery", hidden)(
            h2(I18nKey.unchecked("muteAuthSaveCodes").txt()),
            p(
              I18nKey.unchecked("muteAuthCodesHelp").txt()
            ),
            textarea(
              id := "nostr-security-codes",
              cls := "form-control",
              readonly,
              rows := 8,
              autocomplete := "off"
            ),
            a(href := "/club/security", cls := "button")(I18nKey.unchecked("muteAuthCodesSaved").txt())
          ),
          a(id := "nostr-security-done", href := "/club/security", cls := "button", hidden)(
            I18nKey.unchecked("done").txt()
          )
        )
