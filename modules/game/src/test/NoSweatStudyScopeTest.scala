package lila.game

class NoSweatStudyScopeTest extends munit.FunSuite:
  test("scope binds explicit public versus qualification mode to the exact database and host"):
    val local = "mongodb://127.0.0.1:27028/nosweat_calibration_trial1"
    val public = "mongodb://127.0.0.1:27019/nosweat"
    assert(NoSweatStudyScope.valid("trial1", local, local, "127.0.0.1:19763", false))
    assert(NoSweatStudyScope.valid("trial1", public, public, "mutechess.org", true))
    assert(!NoSweatStudyScope.valid("trial1", public, public, "mutechess.org", false))
    assert(!NoSweatStudyScope.valid("trial1", public, public, "127.0.0.1:19763", true))
    assert(!NoSweatStudyScope.valid("trial1", local, public, "127.0.0.1:19763", false))
    assert(!NoSweatStudyScope.valid("trial1", local, local, "mutechess.org", false))
    assert(
      !NoSweatStudyScope.valid("trial1", local.replace("27028", "27018"), local, "127.0.0.1:19763", false)
    )
    assert(!NoSweatStudyScope.valid("../bad", local, local, "127.0.0.1:19763", false))
