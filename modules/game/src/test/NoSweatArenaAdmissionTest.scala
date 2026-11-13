package lila.game

import lila.db.dsl.{ *, given }

class NoSweatArenaAdmissionTest extends munit.FunSuite:
  val tour = TourId("abcdefgh")
  val host = UserId("owner")
  val human = UserId("human")
  val bot = UserId("maia")
  val scope = bdoc("tour" -> tour, "host" -> host, "state" -> "prepared", "roster" -> List(bot))
  val pairing = bdoc("tid" -> tour, "u" -> List(human, bot))
  val reserved =
    bdoc("arena" -> tour, "white" -> human, "black" -> bot, "managed" -> List(bot), "state" -> "reserved")
  def allowed(
      s: Bdoc = scope,
      p: Bdoc = pairing,
      r: Option[Bdoc] = Some(reserved),
      bots: Set[UserId] = Set(bot)
  ) =
    NoSweatArenaAdmission.allows(tour, human, bot, bots, Set(host), Some(s), Some(p), r)
  test("authorized native human/bot pairing requires exact reserved bot seats"):
    assert(allowed())
    assert(!allowed(r = None))
    assert(!allowed(r = Some(reserved ++ bdoc("state" -> "finished"))))
    assert(!allowed(r = Some(reserved ++ bdoc("black" -> UserId("someone")))))
  test("unprepared events, other hosts and other pairings are rejected"):
    assert(!allowed(s = scope ++ bdoc("state" -> "idle")))
    assert(!allowed(s = scope ++ bdoc("host" -> UserId("other"))))
    assert(!allowed(s = scope ++ bdoc("tour" -> TourId("ijklmnop"))))
    assert(!allowed(p = pairing ++ bdoc("u" -> List(bot, human))))
    assert(!allowed(s = scope ++ bdoc("roster" -> List(UserId("other")))))
  test("human-only pairings need native event and pairing authorization but no inference reservation"):
    assert(allowed(r = None, bots = Set.empty))
    assert(!allowed(p = bdoc(), r = None, bots = Set.empty))
  test("two-bot games authorize both managed seats and reject duplicates"):
    val other = UserId("other-maia")
    val s = scope ++ bdoc("roster" -> List(bot, other))
    val p = bdoc("tid" -> tour, "u" -> List(bot, other))
    val r = bdoc(
      "arena" -> tour,
      "white" -> bot,
      "black" -> other,
      "managed" -> List(bot, other),
      "state" -> "reserved"
    )
    assert(
      NoSweatArenaAdmission.allows(tour, bot, other, Set(bot, other), Set(host), Some(s), Some(p), Some(r))
    )
    assert(!NoSweatArenaAdmission.allows(tour, bot, bot, Set(bot), Set(host), Some(s), Some(p), Some(r)))

  test("game admission reads canonical host IDs from the documented string list"):
    val config = play.api.Configuration("nosweat.arena.hosts" -> Seq("owner", "another-owner"))
    assertEquals(NoSweatArenaAdmission.hosts(config), Set(host, UserId("another-owner")))
    assertEquals(NoSweatArenaAdmission.hosts(play.api.Configuration.empty), Set.empty[UserId])
