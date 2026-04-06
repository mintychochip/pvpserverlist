package dev.justin.gambit.particle;

import dev.justin.gambit.resource.ResourceNode;
import dev.justin.gambit.resource.ResourceType;
import net.minestom.server.coordinate.Point;
import net.minestom.server.instance.Instance;
import net.minestom.server.particle.Particle;
import net.minestom.server.item.Material;
import net.minestom.server.item.ItemStack;

import java.util.UUID;

/**
 * Handles particle effects for resource nodes.
 * Different particle types for different resource types.
 */
public class NodeParticleEffects {

    /**
     * Creates particle effects at a resource node position using BLOCK particles
     * matching the resource type's material.
     */
    public static void createNodeParticles(ResourceNode node, Instance instance) {
        Point position = node.getPosition();

        // Create continuous particle effect using BLOCK particle with resource material
        new Thread(() -> {
            while (!node.isRemoved() && instance.getEntity(node.getUniqueId()) != null) {
                Point particlePos = position.add(0, 0.5, 0);

                Material mat = node.getResourceType().material();
                Particle particle = Particle.BLOCK.withBlock(mat.asBlock());

                // Send particles to viewers
                instance.sendPacketToViewers(particle.createPacket(particlePos));

                try {
                    Thread.sleep(500); // every 0.5 seconds
                } catch (InterruptedException e) {
                    break;
                }
            }
        }).start();
    }

    /**
     * Creates a particle burst when a node is harvested using ITEM particles.
     */
    public static void createHarvestParticles(Point position, ResourceType type, Instance instance) {
        Material mat = type.material();
        ItemStack itemStack = ItemStack.of(mat);
        Particle particle = Particle.ITEM.withItem(itemStack);

        // Create burst of particles
        for (int i = 0; i < 15; i++) {
            double angle = (i / 15.0) * Math.PI * 2;
            double velocityX = Math.cos(angle) * 0.3;
            double velocityY = 0.4;
            double velocityZ = Math.sin(angle) * 0.3;

            instance.sendPacketToViewers(particle.createPacket(position, (float) velocityX, (float) velocityY, (float) velocityZ));
        }
    }
}