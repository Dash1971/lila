package lila.app

import lila.db.dsl.{ *, given }

/** Only the unpaid prompt can be dismissed. Receipt/ledger matching never filters on dismissal. */
private[app] object NoSweatDonation:
  def dismissSelector(user: UserId, payment: String): Bdoc =
    bdoc("_id" -> payment, "userId" -> user, "paid" -> false)
