package views

import lila.app.UiEnv.{ *, given }
import lila.core.i18n.I18nKey

def noSweatUnsupported()(using Context) =
  val message = I18nKey.unchecked("muteNotYetSupported").txt()
  Page(message).css("bits.page"):
    main(cls := "box box-pad page-small")(h1(message))
