# WSAdapter

Yet another javascript SOAP client.  This one is an Ecmascript 6 rewrite of a javascript library I had written for some legacy AXIS 1.4 application.  The single script file is in interop/WSAdapter.js.  The interop/test.html file shows basic use of the WSAdapter functions.

#### How to test using the Axis 1.4 SimpleAxisServer

1. check out the WSAdapter repo
2. download an Axis 1.4 archive from one of the [apache mirrors](http://axis.apache.org/axis/java/releases.html)
3. extract the axis-1_4/{lib,samples/echo} directories
4. the axis-ant.jar and log4j* files are not required for the demo so you can remove them
5. download javax.activation and javax.mail jars and move them to the axis-1_4/lib directory


http://central.maven.org/maven2/javax/mail/mail/1.4/
http://central.maven.org/maven2/javax/activation/activation/1.0.2/

