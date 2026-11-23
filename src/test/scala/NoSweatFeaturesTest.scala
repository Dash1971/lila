package lila.app

class NoSweatFeaturesTest extends munit.FunSuite:
  test("reviewed routes preserve method, action and path boundaries"):
    assert(NoSweatFeatures.allows("GET", "/", "Lobby.home"))
    assert(NoSweatFeatures.allows("HEAD", "/", "Lobby.home"))
    assert(NoSweatFeatures.allows("GET", "/club/unsupported", "NoSweat.unsupported"))
    assert(!NoSweatFeatures.allows("POST", "/", "Lobby.home"))
    assert(!NoSweatFeatures.allows("GET", "/future", "Lobby.home"))
    assert(!NoSweatFeatures.allows("GET", "/", "Lobby.futureFeature"))

  test("broad inherited URL families do not admit new upstream actions"):
    assert(!NoSweatFeatures.allows("GET", "/analysis/future", "UserAnalysis.futureFeature"))
    assert(!NoSweatFeatures.allows("GET", "/paste", "Importer.importGame"))
    assert(!NoSweatFeatures.allows("POST", "/import", "Importer.sendGame"))
    assert(!NoSweatFeatures.allows("GET", "/training/frame", "Puzzle.frame"))
    assert(!NoSweatFeatures.allows("GET", "/", ""))

  test("reviewed private activity route remains behind its existing controller authentication"):
    assert(NoSweatFeatures.allows("GET", "/club/internal/activity", "NoSweat.activityStatus"))
    assert(!NoSweatFeatures.allows("POST", "/club/internal/activity", "NoSweat.activityStatus"))

  test("parameterized preferences, relation actions and unique Arena history stay available"):
    for category <- List(
        "display",
        "chess-clock",
        "game-behavior",
        "privacy",
        "notification",
        "engine-analysis"
      )
    do
      assert(NoSweatFeatures.allows("GET", s"/account/preferences/$category", "Pref.form"))
      assert(NoSweatFeatures.allows("HEAD", s"/account/preferences/$category", "Pref.form"))
    for action <- List("block", "unblock") do
      assert(NoSweatFeatures.allows("POST", s"/rel/$action/alice", "Relation.bcAction"))
    assert(NoSweatFeatures.allows("GET", "/tournament/history/unique", "Tournament.history"))
    assert(NoSweatFeatures.allows("GET", "/games/best/replacement/01234567", "Tv.gameChannelReplacement"))
    assert(!NoSweatFeatures.allows("GET", "/account/preferences/future-setting", "Pref.form"))
    assert(!NoSweatFeatures.allows("POST", "/rel/future-action/alice", "Relation.bcAction"))
