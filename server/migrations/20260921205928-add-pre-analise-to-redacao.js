export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('Redacaos', 'preAnaliseIA', {
    type: Sequelize.JSON,
    allowNull: true
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('Redacaos', 'preAnaliseIA');
}