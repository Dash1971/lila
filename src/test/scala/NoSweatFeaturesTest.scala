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
