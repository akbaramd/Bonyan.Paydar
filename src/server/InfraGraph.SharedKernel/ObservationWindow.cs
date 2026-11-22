namespace InfraGraph.SharedKernel;

/// <summary>UTC observation time and server-side receipt time are intentionally distinct.</summary>
public readonly record struct ObservationWindow(DateTimeOffset ObservedAt, DateTimeOffset ReceivedAt)
{
    public bool IsClientClockAhead => ObservedAt > ReceivedAt;
}
