using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace InfraGraph.ControlPlane.Hubs;

/// <summary>Only site-authorized sessions may subscribe to discovery events.</summary>
public sealed class StatusHub : Hub
{
    public async Task JoinSite(string siteId)
    {
        var user = Context.User;
        if (user?.Identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(siteId) ||
            siteId.Length > 120 ||
            (!user.IsInRole("admin") && user.FindFirstValue("site") != siteId))
            throw new HubException("Site access denied.");
        await Groups.AddToGroupAsync(Context.ConnectionId, "site:" + siteId);
    }

    public async Task LeaveSite(string siteId)
    {
        if (string.IsNullOrWhiteSpace(siteId) || siteId.Length > 120)
            throw new HubException("Invalid site.");
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "site:" + siteId);
    }
}
