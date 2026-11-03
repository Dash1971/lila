// Security-only alignment of transitive runtime dependencies (#232).
// Overrides retain the existing dependency graph and native application behavior.
ThisBuild / dependencyOverrides ++= {
  val nettyVersion = "4.2.19.Final"
  val jacksonVersion = "2.18.11"
  Seq(
    "netty-buffer",
    "netty-codec",
    "netty-codec-base",
    "netty-codec-compression",
    "netty-codec-dns",
    "netty-codec-http",
    "netty-codec-http2",
    "netty-common",
    "netty-handler",
    "netty-handler-proxy",
    "netty-resolver",
    "netty-resolver-dns",
    "netty-transport",
    "netty-transport-classes-epoll",
    "netty-transport-classes-kqueue",
    "netty-transport-native-epoll",
    "netty-transport-native-kqueue",
    "netty-transport-native-unix-common"
  ).map("io.netty" % _ % nettyVersion) ++
    Seq("jackson-annotations", "jackson-core", "jackson-databind")
      .map("com.fasterxml.jackson.core" % _ % jacksonVersion) ++
    Seq("jackson-datatype-jdk8", "jackson-datatype-jsr310")
      .map("com.fasterxml.jackson.datatype" % _ % jacksonVersion)
}
