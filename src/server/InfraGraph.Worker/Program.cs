using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Worker;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);
var connection = builder.Configuration.GetConnectionString("ControlPlane");
builder.Services.AddDbContext<InfraGraphDbContext>(o => {
    if (!string.IsNullOrWhiteSpace(connection)) o.UseNpgsql(connection);
});
builder.Services.AddHostedService<Worker>();
builder.Services.AddHostedService<SnmpV3EvidenceWorker>();
await builder.Build().RunAsync();