# Static reference gate: core domain cannot depend on infrastructure or service hosts.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $modules = Get-Content 'src/server/InfraGraph.Modules/InfraGraph.Modules.csproj' -Raw
    $kernel = Get-Content 'src/server/InfraGraph.SharedKernel/InfraGraph.SharedKernel.csproj' -Raw
    $infra = Get-Content 'src/server/InfraGraph.Infrastructure/InfraGraph.Infrastructure.csproj' -Raw
    $gateway = Get-Content 'src/server/InfraGraph.AgentGateway/InfraGraph.AgentGateway.csproj' -Raw
    foreach($type in @('InfraGraph.Infrastructure','InfraGraph.ControlPlane','InfraGraph.AgentGateway','InfraGraph.Worker')) {
        if($modules -match [regex]::Escape($type)) { throw "FORBIDDEN_DOMAIN_REFERENCE: $type" }
    }
    if($kernel -match 'ProjectReference|PackageReference') { throw 'SHARED_KERNEL_MUST_BE_DEPENDENCY_FREE' }
    if($gateway -match 'InfraGraph.ControlPlane') { throw 'AGENT_GATEWAY_MUST_NOT_REFERENCE_ADMIN_HOST' }
    if($infra -notmatch 'InfraGraph.Modules') { throw 'INFRASTRUCTURE_MUST_REFERENCE_CORE' }
    Write-Output 'Project dependency boundary check: PASS'
}
finally { Pop-Location }
