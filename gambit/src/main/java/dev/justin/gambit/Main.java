package dev.justin.gambit;

import net.minestom.server.MinecraftServer;

/**
 * Main entry point for the Gambit Minecraft server.
 */
public class Main {
    public static void main(String[] args) {
        System.out.println("Starting Gambit Server...");
        
        // Initialize the Minecraft server
        MinecraftServer server = MinecraftServer.init();
        
        // Start the server on default Minecraft port
        server.start("0.0.0.0", 25565);
        
        System.out.println("Gambit Server started on port 25565");
    }
}
