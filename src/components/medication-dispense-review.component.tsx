import React, { useEffect, useState } from "react";
import { Medication, MedicationDispense } from "../types";
import MedicationCard from "./medication-card.component";
import { TextArea, ComboBox, Dropdown, NumberInput } from "@carbon/react";
import {
  useLayoutType,
  useConfig,
  useSession,
  userHasAccess,
} from "@openmrs/esm-framework";
import { useTranslation } from "react-i18next";
import {
  getConceptCodingUuid,
  getMedicationReferenceOrCodeableConcept,
  getOpenMRSMedicineDrugName,
} from "../utils";
import styles from "./medication-dispense-review.scss";
import {
  useMedicationCodeableConcept,
  useMedicationFormulations,
} from "../medication/medication.resource";
import { useMedicationRequest } from "../medication-request/medication-request.resource";
import { PharmacyConfig } from "../config-schema";
import {
  useOrderConfig,
  useSubstitutionReasonValueSet,
  useSubstitutionTypeValueSet,
} from "../medication-dispense/medication-dispense.resource";
import { PRIVILEGE_CREATE_DISPENSE_MODIFY_DETAILS } from "../constants";

interface MedicationDispenseReviewProps {
  medicationDispense: MedicationDispense;
  index: number;
  updateMedicationDispense: Function;
}

const MedicationDispenseReview: React.FC<MedicationDispenseReviewProps> = ({
  medicationDispense,
  index,
  updateMedicationDispense,
}) => {
  const { t } = useTranslation();
  const config = useConfig() as PharmacyConfig;
  const session = useSession();
  const [isEditingFormulation, setIsEditingFormulation] = useState(false);
  const [isSubstitution, setIsSubstitution] = useState(false);
  // Dosing Unit eg Tablets
  const [drugDosingUnits, setDrugDosingUnits] = useState([]);
  // Dispensing Unit eg Tablets
  const [drugDispensingUnits, setDrugDispensingUnits] = useState([]);
  // Route eg Oral
  const [drugRoutes, setDrugRoutes] = useState([]);
  // Frequency eg Twice daily
  const [orderFrequencies, setOrderFrequencies] = useState([]);
  // type of substitution question
  const [substitutionTypes, setSubstitutionTypes] = useState([]);
  // reason for substitution question
  const [substitutionReasons, setSubstitutionReasons] = useState([]);
  const [userCanModify, setUserCanModify] = useState(false);

  const isTablet = useLayoutType() === "tablet";

  const { orderConfigObject } = useOrderConfig();
  const { substitutionTypeValueSet } = useSubstitutionTypeValueSet(
    config.substitutionType.uuid
  );
  const { substitutionReasonValueSet } = useSubstitutionReasonValueSet(
    config.substitutionReason.uuid
  );

  useEffect(() => {
    if (orderConfigObject) {
      // sync drug route options order config
      const availableRoutes = drugRoutes.map((x) => x.id);
      const otherRouteOptions = [];
      orderConfigObject.drugRoutes.forEach(
        (x) =>
          availableRoutes.includes(x.uuid) ||
          otherRouteOptions.push({ id: x.uuid, text: x.display })
      );
      setDrugRoutes([...drugRoutes, ...otherRouteOptions]);

      // sync dosage.unit options with what's defined in the order config
      const availableDosingUnits = drugDosingUnits.map((x) => x.id);
      const otherDosingUnits = [];
      orderConfigObject.drugDosingUnits.forEach(
        (x) =>
          availableDosingUnits.includes(x.uuid) ||
          otherDosingUnits.push({ id: x.uuid, text: x.display })
      );
      setDrugDosingUnits([...drugDosingUnits, ...otherDosingUnits]);

      // sync dispensing unit options with what's defined in the order config
      const availableDispensingUnits = drugDispensingUnits.map((x) => x.id);
      const otherDispensingUnits = [];
      orderConfigObject.drugDispensingUnits.forEach(
        (x) =>
          availableDispensingUnits.includes(x.uuid) ||
          otherDispensingUnits.push({ id: x.uuid, text: x.display })
      );
      setDrugDispensingUnits([...drugDispensingUnits, ...otherDispensingUnits]);

      // sync order frequency options with order config
      const availableFrequencies = orderFrequencies.map((x) => x.id);
      const otherFrequencyOptions = [];
      orderConfigObject.orderFrequencies.forEach(
        (x) =>
          availableFrequencies.includes(x.uuid) ||
          otherFrequencyOptions.push({ id: x.uuid, text: x.display })
      );
      setOrderFrequencies([...orderFrequencies, ...otherFrequencyOptions]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderConfigObject]);

  useEffect(() => {
    const substitutionTypeOptions = [];

    if (substitutionTypeValueSet?.compose?.include) {
      const uuidValueSet = substitutionTypeValueSet.compose.include.find(
        (include) => !include.system
      );
      if (uuidValueSet) {
        uuidValueSet.concept?.forEach((concept) =>
          substitutionTypeOptions.push({
            id: concept.code,
            text: concept.display,
          })
        );
      }
    }
    setSubstitutionTypes(substitutionTypeOptions);
  }, [substitutionTypeValueSet]);

  useEffect(() => {
    const substitutionReasonOptions = [];

    if (substitutionReasonValueSet?.compose?.include) {
      const uuidValueSet = substitutionReasonValueSet.compose.include.find(
        (include) => !include.system
      );
      if (uuidValueSet) {
        uuidValueSet.concept?.forEach((concept) =>
          substitutionReasonOptions.push({
            id: concept.code,
            text: concept.display,
          })
        );
      }
    }
    setSubstitutionReasons(substitutionReasonOptions);
  }, [substitutionReasonValueSet]);

  // if this an order for a drug by concept, but not a particular formulation, we already have access to concept uuid
  const existingMedicationCodeableConceptUuid = getConceptCodingUuid(
    getMedicationReferenceOrCodeableConcept(medicationDispense)
      ?.medicationCodeableConcept?.coding
  );
  // otherwise we need to fetch the medication details to get the codeable concept
  // (note that React Hooks should not be called conditionally, so we *always* call this hook, but it will return null if existingMedicationCodeableConcept is defined
  const { medicationCodeableConceptUuid } = useMedicationCodeableConcept(
    existingMedicationCodeableConceptUuid,
    getMedicationReferenceOrCodeableConcept(medicationDispense)
      .medicationReference?.reference
  );
  // get the formulations
  const { medicationFormulations } = useMedicationFormulations(
    existingMedicationCodeableConceptUuid
      ? existingMedicationCodeableConceptUuid
      : medicationCodeableConceptUuid
      ? medicationCodeableConceptUuid
      : null
  );

  // get the medication request associated with this dispense event
  // (we fetch this so that we can use it below to determine if the formulation dispensed varies from what was
  // ordered; it's slightly inefficient/awkward to fetch it from the server here because we *have* fetched it earlier,
  // it just seems cleaner to fetch it here rather than to make sure we pass it down through various components; with
  // SWR handling caching, we may want to consider pulling more down into this)
  const { medicationRequest } = useMedicationRequest(
    medicationDispense.authorizingPrescription
      ? medicationDispense.authorizingPrescription[0].reference
      : null
  );

  // check to see if the current dispense would be a substitution, and update accordingly
  useEffect(() => {
    if (
      medicationRequest?.medicationReference?.reference &&
      medicationDispense?.medicationReference?.reference &&
      medicationRequest.medicationReference.reference !=
        medicationDispense.medicationReference.reference
    ) {
      setIsSubstitution(true);
      updateMedicationDispense(
        {
          ...medicationDispense,
          substitution: {
            ...medicationDispense.substitution,
            wasSubstituted: true,
          },
        },
        index
      );
    } else {
      setIsSubstitution(false);
      updateMedicationDispense(
        {
          ...medicationDispense,
          substitution: {
            wasSubstituted: false,
            reason: [
              {
                coding: [{ code: null }],
              },
            ],
            type: { coding: [{ code: null }] },
          },
        },
        index
      );
    }
  }, [
    medicationDispense.medicationReference,
    medicationRequest?.medicationReference,
  ]);

  useEffect(() => {
    setUserCanModify(
      session?.user &&
        userHasAccess(PRIVILEGE_CREATE_DISPENSE_MODIFY_DETAILS, session.user)
    );
  }, [session]);

  return (
    <div className={styles.medicationDispenseReviewContainer}>
      {!isEditingFormulation ? (
        <MedicationCard
          medication={getMedicationReferenceOrCodeableConcept(
            medicationDispense
          )}
          editAction={
            userCanModify ? () => setIsEditingFormulation(true) : null
          }
        />
      ) : (
        <Dropdown
          id="medicationFormulation"
          light={isTablet}
          items={medicationFormulations}
          itemToString={(item: Medication) => getOpenMRSMedicineDrugName(item)}
          initialSelectedItem={{
            ...medicationFormulations?.find(
              (formulation) =>
                formulation.id ===
                medicationDispense.medicationReference?.reference.split("/")[1]
            ),
          }}
          onChange={({ selectedItem }) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                medicationCodeableConcept: undefined,
                medicationReference: {
                  reference: "Medication/" + selectedItem?.id,
                  display: getOpenMRSMedicineDrugName(selectedItem),
                },
              },
              index
            );
            setIsEditingFormulation(false);
          }}
          required
        />
      )}

      {isSubstitution && (
        <div className={styles.dispenseDetailsContainer}>
          <ComboBox
            className={styles.substitutionType}
            id="substitutionType"
            light={isTablet}
            items={substitutionTypes}
            titleText={t("substitutionType", "Type of substitution")}
            itemToString={(item) => item?.text}
            initialSelectedItem={{
              id: medicationDispense.substitution.type?.coding[0]?.code,
              text: medicationDispense.substitution.type?.text,
            }}
            onChange={({ selectedItem }) => {
              updateMedicationDispense(
                {
                  ...medicationDispense,
                  substitution: {
                    ...medicationDispense.substitution,
                    type: {
                      coding: [
                        {
                          code: selectedItem?.id,
                        },
                      ],
                    },
                  },
                },
                index
              );
            }}
          />
        </div>
      )}

      {isSubstitution && (
        <div className={styles.dispenseDetailsContainer}>
          <ComboBox
            className={styles.substitutionReason}
            id="substitutionReason"
            light={isTablet}
            items={substitutionReasons}
            titleText={t("substitutionReason", "Reason for substitution")}
            itemToString={(item) => item?.text}
            initialSelectedItem={{
              id: medicationDispense.substitution.reason[0]?.coding[0]?.code,
              text: medicationDispense.substitution.reason[0]?.text,
            }}
            onChange={({ selectedItem }) => {
              updateMedicationDispense(
                {
                  ...medicationDispense,
                  substitution: {
                    ...medicationDispense.substitution,
                    reason: [
                      {
                        coding: [
                          {
                            code: selectedItem?.id,
                          },
                        ],
                      },
                    ],
                  },
                },
                index
              );
            }}
          />
        </div>
      )}

      <div className={styles.dispenseDetailsContainer}>
        <NumberInput
          allowEmpty={false}
          disabled={!userCanModify}
          hideSteppers={true}
          id="quantity"
          invalidText={t("numberIsNotValid", "Number is not valid")}
          label={t("quantity", "Quantity")}
          min={0}
          value={medicationDispense.quantity.value}
          onChange={(e) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                quantity: {
                  ...medicationDispense.quantity,
                  value: e.target.value,
                },
              },
              index
            );
          }}
        />

        <ComboBox
          id="quantityUnits"
          disabled={!userCanModify}
          light={isTablet}
          items={drugDispensingUnits}
          titleText={t("drugDispensingUnit", "Dispensing unit")}
          itemToString={(item) => item?.text}
          initialSelectedItem={{
            id: medicationDispense.quantity.code,
            text: medicationDispense.quantity.unit,
          }}
          onChange={({ selectedItem }) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                // note that we specifically recreate doesQuantity to overwrite any unit or system properties that may have been set
                quantity: {
                  value: medicationDispense.quantity.value,
                  code: selectedItem?.id,
                },
              },
              index
            );
          }}
          required
        />
      </div>

      <div className={styles.dispenseDetailsContainer}>
        <NumberInput
          allowEmpty={false}
          disabled={!userCanModify}
          hideSteppers={true}
          id="dosingQuanity"
          light={isTablet}
          invalidText={t("numberIsNotValid", "Number is not valid")}
          min={0}
          label={t("dose", "Dose")}
          value={
            medicationDispense.dosageInstruction[0].doseAndRate[0].doseQuantity
              .value
          }
          onChange={(e) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                dosageInstruction: [
                  {
                    ...medicationDispense.dosageInstruction[0],
                    doseAndRate: [
                      {
                        ...medicationDispense.dosageInstruction[0]
                          .doseAndRate[0],
                        doseQuantity: {
                          ...medicationDispense.dosageInstruction[0]
                            .doseAndRate[0].doseQuantity,
                          value: e.target.value,
                        },
                      },
                    ],
                  },
                ],
              },
              index
            );
          }}
        />

        <ComboBox
          id="dosingUnits"
          disabled={!userCanModify}
          light={isTablet}
          items={drugDosingUnits}
          titleText={t("doseUnit", "Dose unit")}
          itemToString={(item) => item?.text}
          initialSelectedItem={{
            id: medicationDispense.dosageInstruction[0].doseAndRate[0]
              .doseQuantity?.code,
            text: medicationDispense.dosageInstruction[0].doseAndRate[0]
              .doseQuantity?.unit,
          }}
          onChange={({ selectedItem }) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                dosageInstruction: [
                  {
                    ...medicationDispense.dosageInstruction[0],
                    doseAndRate: [
                      {
                        doseQuantity: {
                          // note that we specifically recreate doesQuantity to overwrite any unit or system properties that may have been set
                          value:
                            medicationDispense.dosageInstruction[0]
                              .doseAndRate[0].doseQuantity?.value,
                          code: selectedItem?.id,
                        },
                      },
                    ],
                  },
                ],
              },
              index
            );
          }}
          required
        />

        <ComboBox
          id="editRoute"
          disabled={!userCanModify}
          light={isTablet}
          items={drugRoutes}
          initialSelectedItem={{
            id: medicationDispense.dosageInstruction[0].route?.coding[0]?.code,
            text: medicationDispense.dosageInstruction[0].route?.text,
          }}
          titleText={t("route", "Route")}
          itemToString={(item) => item?.text}
          onChange={({ selectedItem }) => {
            updateMedicationDispense(
              {
                ...medicationDispense,
                dosageInstruction: [
                  {
                    ...medicationDispense.dosageInstruction[0],
                    route: {
                      coding: [
                        {
                          code: selectedItem?.id,
                        },
                      ],
                    },
                  },
                ],
              },
              index
            );
          }}
          required
        />
      </div>

      <ComboBox
        id="frequency"
        disabled={!userCanModify}
        light={isTablet}
        items={orderFrequencies}
        initialSelectedItem={{
          id: medicationDispense.dosageInstruction[0].timing?.code?.coding[0]
            ?.code,
          text: medicationDispense.dosageInstruction[0].timing?.code?.text,
        }}
        titleText={t("frequency", "Frequency")}
        itemToString={(item) => item?.text}
        onChange={({ selectedItem }) => {
          updateMedicationDispense(
            {
              ...medicationDispense,
              dosageInstruction: [
                {
                  ...medicationDispense.dosageInstruction[0],
                  timing: {
                    ...medicationDispense.dosageInstruction[0].timing,
                    code: {
                      coding: [
                        {
                          code: selectedItem?.id,
                        },
                      ],
                    },
                  },
                },
              ],
            },
            index
          );
        }}
        required
      />

      <TextArea
        labelText={t("patientInstructions", "Patient instructions")}
        value={medicationDispense.dosageInstruction[0].text}
        maxLength={65535}
        onChange={(e) => {
          updateMedicationDispense(
            {
              ...medicationDispense,
              dosageInstruction: [
                {
                  ...medicationDispense.dosageInstruction[0],
                  text: e.target.value,
                },
              ],
            },
            index
          );
        }}
      />
    </div>
  );
};

export default MedicationDispenseReview;
