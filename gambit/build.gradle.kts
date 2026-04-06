import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    application
}

// Set the JVM target
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

// Configure the main class
application {
    mainClass.set("dev.justin.gambit.Main")
}

// Configure repositories
repositories {
    mavenCentral()
    maven(url = "https://jitpack.io")
    maven(url = "https://repo.spongepowered.org/maven")
    maven(url = "https://libraries.minecraft.net/")
}

// Define dependencies
dependencies {
    implementation("com.github.Minestom:Minestom:1.5.1")
    implementation("com.google.code.gson:gson:2.8.9")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.22")
    implementation("org.apache.logging.log4j:log4j-core:2.20.0")
    implementation("org.apache.logging.log4j:log4j-api:2.20.0")
    
    // Add your other dependencies here
    testImplementation("org.junit.jupiter:junit-jupiter:5.8.2")
    testImplementation("org.mockito:mockito-core:4.11.0")
}

// Configure Kotlin compilation
tasks.withType<KotlinCompile> {
    kotlinOptions.jvmTarget = "21"
}

// Configure application startup
tasks.named<JavaExec>("run") {
    args = listOf("arg1", "arg2") // Replace with your arguments
}