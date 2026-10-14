# btleplug's Java classes are reached only through JNI, so R8 would strip them as dead code.
-keep class com.nonpolynomial.** { *; }
-keep class io.github.gedgygedgy.** { *; }
