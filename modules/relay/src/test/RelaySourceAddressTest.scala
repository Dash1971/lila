package lila.relay

import java.net.InetAddress
import play.api.Mode

class RelaySourceAddressTest extends munit.FunSuite:

  private def address(ip: String) = InetAddress.getByName(ip)

  test("production rejects local, wildcard, link-local and private source addresses"):
    given Mode = Mode.Prod
    List(
      "127.0.0.1",
      "127.42.1.9",
      "0.0.0.0",
      "169.254.169.254",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "::",
      "::1",
      "fe80::1",
      "fec0::1"
    ).foreach: ip =>
      assert(!RelayRoundForm.validateIp(address(ip)), ip)

  test("production retains global IPv4 and IPv6 source addresses"):
    given Mode = Mode.Prod
    List("8.8.8.8", "1.1.1.1", "2606:4700:4700::1111").foreach: ip =>
      assert(RelayRoundForm.validateIp(address(ip)), ip)

  test("development and test retain the upstream local-source allowance"):
    assert(RelayRoundForm.validateIp(address("127.0.0.1"))(using Mode.Dev))
    assert(RelayRoundForm.validateIp(address("127.0.0.1"))(using Mode.Test))

  test("production source cleaning rejects the additional upstream-blocked domain"):
    given Mode = Mode.Prod
    assertEquals(RelayRoundForm.cleanUrl("https://lichess.ovh/games.pgn"), None)
    assertEquals(RelayRoundForm.cleanUrl("https://sub.lichess.ovh/games.pgn"), None)
