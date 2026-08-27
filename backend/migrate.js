const { query } = require('./db');

async function migrate() {
  console.log('🔄 Starting AgriConnect DB Migration...');
  try {
    // 1. Add coordinate and geocode meta columns to farmer_profiles
    await query(`
      ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS latitude DECIMAL;
      ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS longitude DECIMAL;
      ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS geo_provider VARCHAR(50);
      ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP;
    `);
    console.log('✅ Added coordinate columns to farmer_profiles.');

    // 2. Add coordinate and geocode meta columns to buyer_profiles
    await query(`
      ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS latitude DECIMAL;
      ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS longitude DECIMAL;
      ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS geo_provider VARCHAR(50);
      ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP;
    `);
    console.log('✅ Added coordinate columns to buyer_profiles.');

    // 3. Add order_id column to routes table referencing orders(id)
    await query(`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
    `);
    console.log('✅ Linked routes table to orders table.');

    // 4. Migrate consumer_profiles to buyer_profiles
    const consumers = await query('SELECT * FROM consumer_profiles');
    console.log(`👤 Found ${consumers.rows.length} consumer profiles to migrate.`);

    for (const consumer of consumers.rows) {
      await query(`
        INSERT INTO buyer_profiles (
          id, user_id, name, company_name, organization_type, 
          location, state, district, email, verification_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id) DO UPDATE SET
          name = EXCLUDED.name,
          organization_type = EXCLUDED.organization_type,
          location = EXCLUDED.location,
          email = EXCLUDED.email
      `, [
        consumer.id,
        consumer.user_id,
        consumer.name,
        'Individual',
        'INDIVIDUAL',
        consumer.address || 'Delhi',
        'Delhi',
        'Delhi',
        consumer.email || 'rahul@consumer.com',
        true,
        consumer.created_at,
        consumer.updated_at
      ]);
    }
    console.log('✅ Successfully migrated consumer profiles to buyer_profiles table.');
    console.log('🎉 DB Migration Completed Successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
