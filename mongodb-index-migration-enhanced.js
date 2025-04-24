// mongodb-index-migration-enhanced.js
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration (will be loaded from config.json)
let config = {
  source: {
    uri: "mongodb://source-mongodb-uri:27017",
    dbName: "sourceDB"
  },
  target: {
    uri: "mongodb://target-mongodb-uri:27017",
    dbName: "targetDB"
  },
  // Optional: collections to process (if empty, all collections will be processed)
  collections: [],
  // Custom indexes to create (manually defined)
  customIndexes: [
    // Example format:
    // {
    //   collectionName: "users",
    //   index: {
    //     key: { email: 1 },
    //     name: "email_index",
    //     unique: true,
    //     background: true
    //   }
    // }
  ]
};

// Logger
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`),
  success: (message) => console.log(`[SUCCESS] ${message}`),
  warning: (message) => console.log(`[WARNING] ${message}`)
};

// Load configuration
const loadConfig = () => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath);
      config = JSON.parse(configFile);
      logger.info('Configuration loaded successfully');
    } else {
      logger.warning('config.json not found, using default configuration');
      // Create example config file
      fs.writeFileSync(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      logger.info(`Example config file created at ${configPath}`);
    }
  } catch (error) {
    logger.error(`Failed to load configuration: ${error.message}`);
  }
};

// Connect to MongoDB
const connectToMongo = async (uri) => {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    logger.info(`Connected to MongoDB at ${uri}`);
    return client;
  } catch (error) {
    logger.error(`Failed to connect to MongoDB at ${uri}: ${error.message}`);
    throw error;
  }
};

// Get collections to process
const getCollections = async (db, specifiedCollections) => {
  try {
    if (specifiedCollections && specifiedCollections.length > 0) {
      return specifiedCollections;
    }
    
    const collections = await db.listCollections().toArray();
    return collections.map(collection => collection.name);
  } catch (error) {
    logger.error(`Failed to get collections: ${error.message}`);
    throw error;
  }
};

// Get indexes from a collection
const getIndexes = async (db, collectionName) => {
  try {
    const collection = db.collection(collectionName);
    const indexes = await collection.indexes();
    logger.info(`Retrieved ${indexes.length} indexes from collection ${collectionName}`);
    return indexes;
  } catch (error) {
    logger.error(`Failed to get indexes from collection ${collectionName}: ${error.message}`);
    return [];
  }
};

// Create an index on the target collection
const createIndex = async (db, collectionName, indexSpec) => {
  try {
    const collection = db.collection(collectionName);
    
    // Skip the _id_ index as it's created automatically
    if (indexSpec.name === '_id_') {
      logger.info(`Skipping _id_ index for collection ${collectionName}`);
      return;
    }

    // Extract the index specification
    const keys = indexSpec.key;
    const options = { ...indexSpec };
    
    // Remove properties that aren't index options
    delete options.key;
    delete options.v;
    delete options.ns;

    // Create the index
    await collection.createIndex(keys, options);
    logger.success(`Successfully created index ${indexSpec.name || JSON.stringify(keys)} on collection ${collectionName}`);
  } catch (error) {
    if (error.code === 85 || error.message.includes('already exists')) {
      logger.warning(`Index ${indexSpec.name || JSON.stringify(indexSpec.key)} already exists on collection ${collectionName} - skipping`);
    } else {
      logger.error(`Failed to create index ${indexSpec.name || JSON.stringify(indexSpec.key)} on collection ${collectionName}: ${error.message}`);
    }
    // Continue with the next index
  }
};

// Migrate indexes for a collection
const migrateCollectionIndexes = async (sourceDb, targetDb, collectionName) => {
  try {
    logger.info(`Migrating indexes for collection ${collectionName}...`);
    
    // Get indexes from source collection
    const indexes = await getIndexes(sourceDb, collectionName);
    
    // Create collection if it doesn't exist
    if (!await targetDb.listCollections({ name: collectionName }).hasNext()) {
      await targetDb.createCollection(collectionName);
      logger.info(`Created collection ${collectionName} in target database`);
    }
    
    // Create each index on the target collection
    for (const indexSpec of indexes) {
      await createIndex(targetDb, collectionName, indexSpec);
    }
    
    logger.success(`Completed index migration for collection ${collectionName}`);
  } catch (error) {
    logger.error(`Error while migrating indexes for collection ${collectionName}: ${error.message}`);
    // Continue with the next collection
  }
};

// Create custom indexes defined in the configuration
const createCustomIndexes = async (targetDb) => {
  try {
    if (!config.customIndexes || config.customIndexes.length === 0) {
      logger.info('No custom indexes defined in configuration');
      return;
    }

    logger.info(`Creating ${config.customIndexes.length} custom indexes...`);

    for (const customIndex of config.customIndexes) {
      const { collectionName, index } = customIndex;
      
      // Create collection if it doesn't exist
      if (!await targetDb.listCollections({ name: collectionName }).hasNext()) {
        await targetDb.createCollection(collectionName);
        logger.info(`Created collection ${collectionName} in target database`);
      }
      
      await createIndex(targetDb, collectionName, index);
    }
    
    logger.success('Custom indexes creation completed');
  } catch (error) {
    logger.error(`Error while creating custom indexes: ${error.message}`);
  }
};

// Interactive index creation mode
const startInteractiveMode = async (targetClient) => {
  const targetDb = targetClient.db(config.target.dbName);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  try {
    logger.info('Starting interactive index creation mode...');
    
    while (true) {
      console.log('\n========== Interactive Index Creation ==========');
      
      const collectionName = await promptQuestion('Enter collection name (or "exit" to quit): ');
      if (collectionName.toLowerCase() === 'exit') break;
      
      // Check if collection exists, create if not
      if (!await targetDb.listCollections({ name: collectionName }).hasNext()) {
        const createCollection = await promptQuestion(`Collection "${collectionName}" doesn't exist. Create it? (y/n): `);
        if (createCollection.toLowerCase() === 'y') {
          await targetDb.createCollection(collectionName);
          logger.info(`Created collection ${collectionName}`);
        } else {
          continue;
        }
      }
      
      console.log('\nDefine index fields and options:');
      console.log('Format example for fields: { "email": 1, "username": 1 }');
      console.log('1 for ascending, -1 for descending, "text" for text index');
      
      const fieldsStr = await promptQuestion('Enter index fields as JSON: ');
      let fields;
      try {
        fields = JSON.parse(fieldsStr);
      } catch (err) {
        logger.error('Invalid JSON format for index fields. Try again.');
        continue;
      }
      
      const indexName = await promptQuestion('Enter index name (optional, press Enter to skip): ');
      
      const uniqueStr = await promptQuestion('Should this index be unique? (y/n): ');
      const unique = uniqueStr.toLowerCase() === 'y';
      
      const sparseStr = await promptQuestion('Should this index be sparse? (y/n): ');
      const sparse = sparseStr.toLowerCase() === 'y';
      
      const backgroundStr = await promptQuestion('Create index in background? (y/n): ');
      const background = backgroundStr.toLowerCase() === 'y';
      
      const ttlStr = await promptQuestion('Add TTL expiration (seconds, 0 for none): ');
      const ttl = parseInt(ttlStr);
      
      // Build index specification
      const indexSpec = {
        key: fields,
        background
      };
      
      if (indexName) indexSpec.name = indexName;
      if (unique) indexSpec.unique = true;
      if (sparse) indexSpec.sparse = true;
      if (ttl > 0) indexSpec.expireAfterSeconds = ttl;
      
      // Confirm and create index
      console.log('\nIndex specification:');
      console.log(JSON.stringify(indexSpec, null, 2));
      
      const confirmCreate = await promptQuestion('Create this index? (y/n): ');
      if (confirmCreate.toLowerCase() === 'y') {
        await createIndex(targetDb, collectionName, indexSpec);
        
        // Ask if the user wants to save this index to config
        const saveToConfig = await promptQuestion('Save this index to config.json for future use? (y/n): ');
        if (saveToConfig.toLowerCase() === 'y') {
          if (!config.customIndexes) config.customIndexes = [];
          
          config.customIndexes.push({
            collectionName,
            index: indexSpec
          });
          
          // Save updated config
          fs.writeFileSync(
            path.join(__dirname, 'config.json'),
            JSON.stringify(config, null, 2),
            'utf8'
          );
          logger.info('Index added to configuration file');
        }
      }
      
      const addAnother = await promptQuestion('Add another index? (y/n): ');
      if (addAnother.toLowerCase() !== 'y') break;
    }
    
    logger.success('Interactive index creation completed');
  } catch (error) {
    logger.error(`Error in interactive mode: ${error.message}`);
  } finally {
    rl.close();
  }
};

// List all indexes in a database
const listAllIndexes = async (client, dbName) => {
  try {
    const db = client.db(dbName);
    const collections = await getCollections(db, []);
    
    console.log('\n========== Current Indexes ==========');
    console.log(`Database: ${dbName}`);
    
    for (const collectionName of collections) {
      const indexes = await getIndexes(db, collectionName);
      
      console.log(`\nCollection: ${collectionName}`);
      console.log('Indexes:');
      
      if (indexes.length === 0) {
        console.log('  No indexes found');
        continue;
      }
      
      indexes.forEach((index, i) => {
        console.log(`  ${i + 1}. Name: ${index.name}`);
        console.log(`     Key: ${JSON.stringify(index.key)}`);
        
        // Display important options
        const options = [];
        if (index.unique) options.push('unique');
        if (index.sparse) options.push('sparse');
        if (index.expireAfterSeconds !== undefined) options.push(`TTL: ${index.expireAfterSeconds}s`);
        
        if (options.length > 0) {
          console.log(`     Options: ${options.join(', ')}`);
        }
      });
    }
  } catch (error) {
    logger.error(`Error listing indexes: ${error.message}`);
  }
};

// Helper function to check if two indexes are equivalent 
const areIndexesEquivalent = (indexA, indexB) => {
  // Compare keys (most important part)
  const keysA = JSON.stringify(indexA.key);
  const keysB = JSON.stringify(indexB.key);
  
  if (keysA !== keysB) return false;
  
  // Compare critical options
  if (indexA.unique !== indexB.unique) return false;
  if (indexA.sparse !== indexB.sparse) return false;
  if (indexA.expireAfterSeconds !== indexB.expireAfterSeconds) return false;
  
  // For text indexes, compare weights if provided
  if (indexA.key && Object.values(indexA.key).includes('text')) {
    if (JSON.stringify(indexA.weights || {}) !== JSON.stringify(indexB.weights || {})) {
      return false;
    }
  }
  
  // For partial indexes, compare filter if provided
  if (JSON.stringify(indexA.partialFilterExpression || {}) !== 
      JSON.stringify(indexB.partialFilterExpression || {})) {
    return false;
  }
  
  return true;
};

// Compare indexes between source and target databases
const compareIndexes = async (sourceClient, targetClient) => {
  try {
    const sourceDb = sourceClient.db(config.source.dbName);
    const targetDb = targetClient.db(config.target.dbName);
    
    // Get collections from source
    const sourceCollections = await getCollections(sourceDb, config.collections);
    logger.info(`Found ${sourceCollections.length} collections in source database`);
    
    // Get target collections
    const targetCollections = await getCollections(targetDb, []);
    
    // Results object to store missing indexes
    const missingIndexes = {};
    let totalMissingIndexes = 0;
    
    // Process each collection
    for (const collectionName of sourceCollections) {
      logger.info(`Comparing indexes for collection ${collectionName}...`);
      
      // Get source indexes
      const sourceIndexes = await getIndexes(sourceDb, collectionName);
      
      // Skip if collection doesn't exist in target
      if (!targetCollections.includes(collectionName)) {
        logger.warning(`Collection ${collectionName} doesn't exist in target database`);
        missingIndexes[collectionName] = {
          collectionMissing: true,
          indexes: sourceIndexes.filter(index => index.name !== '_id_')
        };
        totalMissingIndexes += sourceIndexes.filter(index => index.name !== '_id_').length;
        continue;
      }
      
      // Get target indexes
      const targetIndexes = await getIndexes(targetDb, collectionName);
      
      // Find missing indexes
      const missing = [];
      
      for (const sourceIndex of sourceIndexes) {
        // Skip _id_ index as it's automatically created
        if (sourceIndex.name === '_id_') continue;
        
        // Check if equivalent index exists in target
        const hasEquivalent = targetIndexes.some(targetIndex => 
          areIndexesEquivalent(sourceIndex, targetIndex)
        );
        
        if (!hasEquivalent) {
          missing.push(sourceIndex);
          totalMissingIndexes++;
        }
      }
      
      if (missing.length > 0) {
        missingIndexes[collectionName] = {
          collectionMissing: false,
          indexes: missing
        };
      }
    }
    
    // Display and return results
    console.log('\n========== Missing Indexes Report ==========');
    console.log(`Found ${totalMissingIndexes} indexes missing in target database`);
    
    if (totalMissingIndexes === 0) {
      console.log('All source indexes exist in target database!');
      return { missingIndexes, count: 0 };
    }
    
    for (const [collectionName, data] of Object.entries(missingIndexes)) {
      if (data.indexes.length === 0) continue;
      
      console.log(`\nCollection: ${collectionName}`);
      if (data.collectionMissing) {
        console.log('  [Collection does not exist in target database]');
      }
      
      console.log('  Missing indexes:');
      data.indexes.forEach((index, i) => {
        console.log(`  ${i + 1}. Name: ${index.name}`);
        console.log(`     Key: ${JSON.stringify(index.key)}`);
        
        // Display important options
        const options = [];
        if (index.unique) options.push('unique');
        if (index.sparse) options.push('sparse');
        if (index.expireAfterSeconds !== undefined) options.push(`TTL: ${index.expireAfterSeconds}s`);
        if (index.weights) options.push(`weights: ${JSON.stringify(index.weights)}`);
        if (index.partialFilterExpression) options.push(`filter: ${JSON.stringify(index.partialFilterExpression)}`);
        
        if (options.length > 0) {
          console.log(`     Options: ${options.join(', ')}`);
        }
      });
    }
    
    // Ask if user wants to save missing indexes to config
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const saveToConfig = await new Promise(resolve => {
      rl.question('\nDo you want to save these missing indexes to config.json for future creation? (y/n): ', answer => {
        resolve(answer.toLowerCase() === 'y');
        rl.close();
      });
    });
    
    if (saveToConfig) {
      if (!config.customIndexes) config.customIndexes = [];
      
      // Add missing indexes to config
      for (const [collectionName, data] of Object.entries(missingIndexes)) {
        for (const index of data.indexes) {
          config.customIndexes.push({
            collectionName,
            index
          });
        }
      }
      
      // Save updated config
      fs.writeFileSync(
        path.join(__dirname, 'config.json'),
        JSON.stringify(config, null, 2),
        'utf8'
      );
      
      logger.success('Missing indexes added to configuration file');
    }
    
    return { missingIndexes, count: totalMissingIndexes };
  } catch (error) {
    logger.error(`Error comparing indexes: ${error.message}`);
    return { missingIndexes: {}, count: 0 };
  }
};

// Main function
const main = async () => {
  let sourceClient = null;
  let targetClient = null;
  
  try {
    // Load configuration
    loadConfig();

    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    if (command === 'help') {
      console.log(`
MongoDB Index Migration Tool

Usage:
  node mongodb-index-migration-enhanced.js [command]

Commands:
  migrate     Migrate indexes from source to target database
  create      Create custom indexes defined in config.json
  interactive Start interactive index creation mode
  list-source List all indexes in source database
  list-target List all indexes in target database
  compare     Compare indexes between source and target databases
  help        Show this help message
      `);
      return;
    }
    
    // Connect to databases based on the command
    if (['migrate', 'list-source', 'compare'].includes(command)) {
      sourceClient = await connectToMongo(config.source.uri);
    }
    
    if (['migrate', 'create', 'interactive', 'list-target', 'compare'].includes(command)) {
      targetClient = await connectToMongo(config.target.uri);
    }
    
    // Execute the requested command
    switch (command) {
      case 'migrate': {
        const sourceDb = sourceClient.db(config.source.dbName);
        const targetDb = targetClient.db(config.target.dbName);
        
        // Get collections to process
        const collections = await getCollections(sourceDb, config.collections);
        logger.info(`Found ${collections.length} collections to process`);
        
        // Process each collection
        for (const collectionName of collections) {
          await migrateCollectionIndexes(sourceDb, targetDb, collectionName);
        }
        
        logger.success('Index migration completed successfully');
        break;
      }
      
      case 'create': {
        const targetDb = targetClient.db(config.target.dbName);
        await createCustomIndexes(targetDb);
        break;
      }
      
      case 'interactive': {
        await startInteractiveMode(targetClient);
        break;
      }
      
      case 'list-source': {
        await listAllIndexes(sourceClient, config.source.dbName);
        break;
      }
      
      case 'list-target': {
        await listAllIndexes(targetClient, config.target.dbName);
        break;
      }
      
      case 'compare': {
        await compareIndexes(sourceClient, targetClient);
        break;
      }
      
      default:
        logger.error(`Unknown command: ${command}`);
        logger.info('Use "help" command to see available options');
    }
  } catch (error) {
    logger.error(`Operation failed: ${error.message}`);
  } finally {
    // Close MongoDB connections
    if (sourceClient) {
      await sourceClient.close();
      logger.info('Source MongoDB connection closed');
    }
    if (targetClient) {
      await targetClient.close();
      logger.info('Target MongoDB connection closed');
    }
  }
};

// Export functions for potential use as a module
module.exports = {
  compareIndexes,
  createCustomIndexes,
  getIndexes,
  listAllIndexes
};

// Run the application if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}