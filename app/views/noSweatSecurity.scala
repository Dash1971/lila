package views

import lila.core.i18n.I18nKey

import lila.app.UiEnv.{ *, given }

object noSweatSecurity:
  def apply(user: User)(using Context) =
    val enabled = user.totpSecret.isDefined
    def signerButtons = frag(
      button(tpe := "button", cls := "button button-green", attr("data-security-signer") := "extension")(
        if enabled then I18nKey("muteAuthSignDisable").txt() else I18nKey("muteAuthSignEnable").txt()
      ),
      button(tpe := "button", cls := "button button-metal", attr("data-security-signer") := "saved", hidden)(
        I18nKey("muteAuthUseSaved").txt()
      )
    )
    account.ui
      .AccountPage(I18nKey("tfa:twoFactorAuth").txt(), "twofactor")
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=auth-i18n", defer)):
        div(
          id := "nostr-security",
          cls := "box box-pad form3",
          attr("data-enabled") := enabled.toString,
          attr("data-account") := user.username.value
        )(
          h1(I18nKey("tfa:twoFactorAuth").txt()),
          p(id := "nostr-security-state")(if enabled then I18nKey("tfa:twoFactorEnabled").txt()
          else I18nKey("muteAuthDisabled").txt()),
          p(
            I18nKey("muteAuthFactorHelp").txt()
          ),
          p(
            I18nKey("muteAuthChangeHelp").txt()
          ),
          (!enabled).option(
            button(id := "nostr-security-setup", tpe := "button", cls := "button")(
              I18nKey("muteAuthSetup").txt()
            )
          ),
          div(id := "nostr-security-enroll", hidden)(
            h2(I18nKey("muteAuthAddApp").txt()),
            p(I18nKey("muteAuthScanOrType").txt()),
            canvas(
              id := "nostr-security-qr",
              cls := "qrcode",
              aria.label := I18nKey("muteAuthQrLabel").txt()
            ),
            p(I18nKey("muteAuthSetupKey").txt(), " ", code(id := "nostr-security-secret")),
            (!enabled).option(
              frag(
                label(`for` := "nostr-security-token")(I18nKey("tfa:authenticationCode").txt()),
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
              h2(I18nKey("tfa:disableTwoFactor").txt()),
              label(`for` := "nostr-security-token")(I18nKey("muteAuthUnusedCode").txt()),
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
            attr("data-manual") := I18nKey("muteAuthManual").txt(),
            attr("data-no-key") := I18nKey("muteAuthNoKey").txt(),
            attr("data-need-signer") := I18nKey("muteAuthNeedSigner").txt(),
            attr("data-enter-code") := I18nKey("muteAuthEnterCode").txt(),
            attr("data-disabled") := I18nKey("muteAuthDisabled").txt(),
            attr("data-save-now") := I18nKey("muteAuthSaveNow").txt(),
            attr("data-sessions-closed") := I18nKey("muteAuthSessionsClosed").txt(),
            attr("data-failure") := I18nKey("muteAuthFailure").txt(),
            attr("data-invalid-code") := I18nKey("muteAuthInvalidCode").txt(),
            attr("data-busy") := I18nKey("muteAuthPleaseWait").txt(),
            attr("data-wrong-signer") := I18nKey("muteAuthWrongSigner").txt(),
            attr("data-reload") := I18nKey("muteAuthReload").txt(),
            attr("data-enabled") := I18nKey("tfa:twoFactorEnabled").txt(),
            role := "status",
            aria.live := "polite"
          ),
          div(id := "nostr-security-recovery", hidden)(
            h2(I18nKey("muteAuthSaveCodes").txt()),
            p(
              I18nKey("muteAuthCodesHelp").txt()
            ),
            textarea(
              id := "nostr-security-codes",
              cls := "form-control",
              readonly,
              rows := 8,
              autocomplete := "off"
            ),
            a(href := "/club/security", cls := "button")(I18nKey("muteAuthCodesSaved").txt())
          ),
          a(id := "nostr-security-done", href := "/club/security", cls := "button", hidden)(
            I18nKey("done").txt()
          )
        )
