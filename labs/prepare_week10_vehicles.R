# Prepare the Week 10 vehicle data from Waka Kotahi's MVR data.
#
# Usage (from the labs directory):
#   Rscript prepare_week10_vehicles.R path/to/Vehicle_Year_2025.csv
#
# The input should be the cleaned "Vehicle Year - 2025" CSV downloaded from
# Waka Kotahi's vehicle-fleet open-data page.  The downloaded file is not
# committed: it is large and the source is updated monthly.  The output is a
# small, reproducible teaching file that is safe to distribute with the lab.
# Source: https://nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets
# Snapshot used for the committed extract: 31 July 2026.

suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
  library(stringr)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1 || !nzchar(args[[1]])) {
  stop("Supply the path to Waka Kotahi's Vehicle Year - 2025 CSV.", call. = FALSE)
}

input_path <- args[[1]]
output_path <- if (length(args) >= 2 && nzchar(args[[2]])) {
  args[[2]]
} else {
  "nz_vehicles_2025.csv"
}

raw <- read_csv(input_path, show_col_types = FALSE, name_repair = "minimal")

required <- c(
  "MAKE", "MODEL", "BODY_TYPE", "VEHICLE_YEAR", "VEHICLE_TYPE",
  "MOTIVE_POWER", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS",
  "FC_COMBINED"
)
missing_columns <- setdiff(required, names(raw))
if (length(missing_columns) > 0) {
  stop(
    "The input is missing required columns: ",
    paste(missing_columns, collapse = ", "),
    call. = FALSE
  )
}

# MVR fuel-use fields can be delivered as text. parse_number() handles both
# ordinary decimals and occasional formatting whitespace safely.
clean <- raw |>
  filter(
    VEHICLE_YEAR == 2025,
    VEHICLE_TYPE == "PASSENGER CAR/VAN",
    MOTIVE_POWER == "PETROL"
  ) |>
  transmute(
    make = str_squish(as.character(MAKE)),
    model = str_squish(as.character(MODEL)),
    body_type = str_squish(as.character(BODY_TYPE)),
    engine_l = as.numeric(CC_RATING) / 1000,
    power_kw = as.numeric(POWER_RATING),
    gross_mass_kg = as.numeric(GROSS_VEHICLE_MASS),
    fuel_use_l_per_100km = parse_number(as.character(FC_COMBINED))
  ) |>
  filter(
    if_all(everything(), ~ !is.na(.x)),
    make != "",
    model != "",
    body_type != "",
    engine_l > 0,
    power_kw > 0,
    gross_mass_kg > 0,
    between(fuel_use_l_per_100km, 1, 60)
  ) |>
  distinct() |>
  arrange(make, model, body_type, engine_l, power_kw, gross_mass_kg,
          fuel_use_l_per_100km)

if (nrow(clean) == 0) {
  stop("No rows remain after the Week 10 filters.", call. = FALSE)
}

write_csv(clean, output_path, na = "")
message("Wrote ", nrow(clean), " unique vehicle specifications to ", output_path)
message("Source filters: 2025; PASSENGER CAR/VAN; PETROL; complete positive values")
