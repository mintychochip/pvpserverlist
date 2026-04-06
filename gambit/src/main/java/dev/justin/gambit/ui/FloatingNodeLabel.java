package dev.justin.gambit.ui;

import dev.justin.gambit.resource.ResourceNode;
import dev.justin.gambit.resource.ResourceType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.coordinate.Point;
import net.minestom.server.entity.Entity;
import net.minestom.server.entity.EntityType;
import net.minestom.server.entity.metadata.display.TextDisplayMeta;
import net.minestom.server.instance.Instance;

import java.util.UUID;

/**
 * Floating text labels above resource nodes showing resource type
 */
public class FloatingNodeLabel {

    private final Entity textDisplay;
    private final ResourceNode node;

    public FloatingNodeLabel(ResourceNode node, Instance instance) {
        this.node = node;
        this.textDisplay = createTextDisplay(node.getPosition(), instance);
    }

    private Entity createTextDisplay(Point position, Instance instance) {
        // Position text above the node
        Point textPos = position.add(0, 1.5, 0);

        Entity display = new Entity(EntityType.TEXT_DISPLAY);
        display.setInstance(instance, textPos);
        display.setNoGravity(true);
        display.setInvulnerable(true);

        // Configure text display metadata
        TextDisplayMeta meta = (TextDisplayMeta) display.getEntityMeta();
        meta.setViewRange(32f);
        meta.setBillboard(true);
        meta.setBrightness(new TextDisplayMeta.Brightness(15, 15));

        // Set text with color based on resource type
        Component text = Component.text(node.getResourceType().getName(), getResourceColor(node.getResourceType()))
            .decoration(net.kyori.adventure.text.format.TextDecoration.BOLD, true);
        meta.setText(text);

        return display;
    }

    private NamedTextColor getResourceColor(ResourceType type) {
        return switch (type) {
            case WOOD -> NamedTextColor.DARK_GREEN;
            case STONE -> NamedTextColor.GRAY;
            case IRON -> NamedTextColor.LIGHT_GRAY;
            case GOLD -> NamedTextColor.GOLD;
            case DIAMOND -> NamedTextColor.AQUA;
            case COAL -> NamedTextColor.DARK_GRAY;
        };
    }

    /**
     * Updates the label text (e.g., when node is depleted)
     */
    public void updateText(String newText) {
        TextDisplayMeta meta = (TextDisplayMeta) textDisplay.getEntityMeta();
        Component text = Component.text(newText, getResourceColor(node.getResourceType()))
            .decoration(net.kyori.adventure.text.format.TextDecoration.BOLD, true);
        meta.setText(text);
    }

    /**
     * Updates the label text based on remaining resources
     */
    public void updateResourceCount(int remaining) {
        String text = node.getResourceType().getName() + " (" + remaining + ")";
        updateText(text);
    }

    /**
     * Removes the label
     */
    public void remove() {
        if (textDisplay != null && !textDisplay.isRemoved()) {
            textDisplay.remove();
        }
    }

    public UUID getUniqueId() {
        return textDisplay.getUniqueId();
    }

    public boolean isRemoved() {
        return textDisplay.isRemoved();
    }
}