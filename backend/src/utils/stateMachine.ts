// Estate Standard - Job State Machine
// Enforces valid status transitions and prevents invalid state changes

import { JobStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

// Valid state transitions for the job lifecycle
const STATE_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  // Initial request created by homeowner
  REQUESTED: ['VENDOR_MATCHED', 'CANCELLED'],

  // Vendor has been matched/notified
  VENDOR_MATCHED: ['VENDOR_ACCEPTED', 'CANCELLED'],

  // Vendor accepted the job
  VENDOR_ACCEPTED: ['SCHEDULED', 'CANCELLED'],

  // Job is scheduled (has date/time)
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],

  // Vendor has checked in and started work
  IN_PROGRESS: ['COMPLETED_BY_VENDOR', 'CANCELLED'],

  // Vendor submitted completion proof
  COMPLETED_BY_VENDOR: ['COMPLETED_CONFIRMED', 'DISPUTED'],

  // Homeowner confirmed completion (or auto-confirmed after 48hrs)
  COMPLETED_CONFIRMED: ['DISPUTED'], // Can still dispute after confirmation

  // Homeowner disputed the completion
  DISPUTED: ['COMPLETED_CONFIRMED', 'CANCELLED'], // Admin can resolve to confirmed or cancel

  // Job was cancelled
  CANCELLED: [], // Terminal state - no further transitions
};

// State machine validation and enforcement
export class JobStateMachine {
  /**
   * Validates if a state transition is allowed
   * @param currentStatus Current job status
   * @param newStatus Desired new status
   * @returns true if transition is valid
   */
  static isValidTransition(
    currentStatus: JobStatus,
    newStatus: JobStatus
  ): boolean {
    const allowedTransitions = STATE_TRANSITIONS[currentStatus];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Enforces state transition rules
   * @param currentStatus Current job status
   * @param newStatus Desired new status
   * @throws AppError if transition is invalid
   */
  static validateTransition(
    currentStatus: JobStatus,
    newStatus: JobStatus
  ): void {
    if (!this.isValidTransition(currentStatus, newStatus)) {
      throw new AppError(
        `Invalid state transition: ${currentStatus} → ${newStatus}. Allowed transitions: ${STATE_TRANSITIONS[currentStatus].join(', ')}`,
        400
      );
    }
  }

  /**
   * Get all allowed transitions from current state
   * @param currentStatus Current job status
   * @returns Array of valid next states
   */
  static getAllowedTransitions(currentStatus: JobStatus): JobStatus[] {
    return STATE_TRANSITIONS[currentStatus];
  }

  /**
   * Check if a status is a terminal state (no further transitions)
   * @param status Job status to check
   * @returns true if status is terminal
   */
  static isTerminalState(status: JobStatus): boolean {
    return STATE_TRANSITIONS[status].length === 0;
  }

  /**
   * Get human-readable status description
   * @param status Job status
   * @returns Description of what the status means
   */
  static getStatusDescription(status: JobStatus): string {
    const descriptions: Record<JobStatus, string> = {
      REQUESTED: 'Service request created by homeowner',
      VENDOR_MATCHED: 'Vendor has been notified and matched',
      VENDOR_ACCEPTED: 'Vendor accepted the job',
      SCHEDULED: 'Job has a scheduled date and time',
      IN_PROGRESS: 'Vendor has checked in and started work',
      COMPLETED_BY_VENDOR: 'Vendor submitted completion proof',
      COMPLETED_CONFIRMED: 'Homeowner confirmed completion (payment released)',
      DISPUTED: 'Homeowner disputed completion (requires admin resolution)',
      CANCELLED: 'Job was cancelled (terminal state)',
    };
    return descriptions[status];
  }

  /**
   * Check if status allows cancellation
   * @param status Current job status
   * @returns true if job can be cancelled from this state
   */
  static canBeCancelled(status: JobStatus): boolean {
    return STATE_TRANSITIONS[status].includes('CANCELLED');
  }

  /**
   * Check if status requires completion proof
   * @param status Job status
   * @returns true if this status requires proof uploads
   */
  static requiresCompletionProof(status: JobStatus): boolean {
    return status === 'COMPLETED_BY_VENDOR' || status === 'COMPLETED_CONFIRMED';
  }

  /**
   * Check if payout can be released for this status
   * @param status Job status
   * @returns true if vendor payout can be released
   */
  static canReleasePayou(status: JobStatus): boolean {
    return status === 'COMPLETED_CONFIRMED';
  }

  /**
   * Get the previous state before a given status (for rollbacks/auditing)
   * @param currentStatus Current status
   * @returns Array of statuses that can transition to current status
   */
  static getPreviousStates(currentStatus: JobStatus): JobStatus[] {
    const previousStates: JobStatus[] = [];

    for (const [fromStatus, toStatuses] of Object.entries(STATE_TRANSITIONS)) {
      if (toStatuses.includes(currentStatus)) {
        previousStates.push(fromStatus as JobStatus);
      }
    }

    return previousStates;
  }
}

/**
 * Audit log entry for state transitions
 */
export interface StateTransitionLog {
  fromStatus: JobStatus;
  toStatus: JobStatus;
  timestamp: Date;
  triggeredBy: string; // userId
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Create audit log entry for state transition
 */
export function createStateTransitionLog(
  fromStatus: JobStatus,
  toStatus: JobStatus,
  userId: string,
  reason?: string,
  metadata?: Record<string, any>
): StateTransitionLog {
  return {
    fromStatus,
    toStatus,
    timestamp: new Date(),
    triggeredBy: userId,
    reason,
    metadata,
  };
}

export default JobStateMachine;
