package dev.justin.gambit.model;

import net.minestom.server.item.Material;
import net.worldseed.multipart.ModelEngine;
import net.worldseed.resourcepack.PackBuilder;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Initializes the WorldSeedEntityEngine model system.
 *
 * <ol>
 *   <li>Copies the resourcepack_template from classpath to a working directory</li>
 *   <li>Runs {@link PackBuilder} to process .bbmodel files into resource pack assets</li>
 *   <li>Saves model mappings and loads them into {@link ModelEngine}</li>
 * </ol>
 *
 * Call {@link #init()} once at server startup, before creating a ResourcePackServer.
 */
public class ModelEngineInit {

    private static final Path WORKING_DIR = Path.of("model_work");
    private static final Path RESOURCEPACK_DIR = WORKING_DIR.resolve("resourcepack");
    private static final Path MODEL_DIR = WORKING_DIR.resolve("models");
    private static final Path MAPPINGS_FILE = WORKING_DIR.resolve("model_mappings.json");

    /** Directory containing the generated resource pack (template + model assets). */
    public static Path getResourcePackDir() {
        return RESOURCEPACK_DIR;
    }

    /**
     * Initialize the model engine. Must be called once at startup before any models are spawned.
     *
     * @param bbmodelDir   directory containing .bbmodel files (e.g. Path.of("bbmodel"))
     * @param templateDir  directory containing the resourcepack_template on the classpath
     */
    public static void init(Path bbmodelDir, String templateDir) throws Exception {
        // Clean old working directory
        if (Files.exists(WORKING_DIR)) {
            deleteRecursively(WORKING_DIR);
        }
        Files.createDirectories(WORKING_DIR);
        Files.createDirectories(RESOURCEPACK_DIR);
        Files.createDirectories(MODEL_DIR);

        // Copy resourcepack_template from classpath to working directory
        copyClasspathDir(templateDir, RESOURCEPACK_DIR);

        // Set the material used for bone display entities
        ModelEngine.setModelMaterial(Material.MAGMA_CREAM);

        // Generate resource pack from .bbmodel files
        if (Files.isDirectory(bbmodelDir)) {
            var config = PackBuilder.generate(bbmodelDir, RESOURCEPACK_DIR, MODEL_DIR);

            // Save model mappings
            Files.writeString(MAPPINGS_FILE, config.modelMappings(), StandardCharsets.UTF_8);

            // Load model mappings into engine
            try (InputStreamReader reader = new InputStreamReader(
                    new FileInputStream(MAPPINGS_FILE.toFile()))) {
                ModelEngine.loadMappings(reader, MODEL_DIR);
            }

            System.out.println("Model engine initialized: " + countBbmodels(bbmodelDir) + " model(s) loaded.");
        } else {
            System.out.println("No bbmodel directory found at " + bbmodelDir + ", skipping model engine init.");
        }
    }

    /** Copy a classpath directory to a filesystem path, preserving structure. */
    private static void copyClasspathDir(String classpathDir, Path target) throws Exception {
        var resource = ModelEngineInit.class.getClassLoader().getResource(classpathDir);
        if (resource == null) {
            throw new IllegalStateException("Classpath directory not found: " + classpathDir);
        }

        var uri = resource.toURI();

        if (uri.getScheme().equals("jar")) {
            try (var fileSystem = java.nio.file.FileSystems.newFileSystem(uri, java.util.Collections.emptyMap())) {
                var sourcePath = fileSystem.getPath(classpathDir);
                Files.walk(sourcePath).forEach(source -> copySourceToTarget(source, sourcePath, target));
            }
        } else {
            var sourcePath = Path.of(uri);
            Files.walk(sourcePath).forEach(source -> copySourceToTarget(source, sourcePath, target));
        }
    }

    private static void copySourceToTarget(Path source, Path sourceBase, Path targetBase) {
        try {
            var relative = sourceBase.relativize(source).toString();
            var dest = targetBase.resolve(relative);
            if (Files.isDirectory(source)) {
                Files.createDirectories(dest);
            } else {
                Files.createDirectories(dest.getParent());
                Files.copy(source, dest);
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void deleteRecursively(Path dir) throws Exception {
        try (var stream = Files.walk(dir)) {
            stream.sorted(java.util.Comparator.reverseOrder())
                  .map(Path::toFile)
                  .forEach(File::delete);
        }
    }

    private static int countBbmodels(Path dir) throws Exception {
        int count = 0;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.bbmodel")) {
            for (Path ignored : stream) count++;
        }
        return count;
    }
}