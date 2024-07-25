# Our second R script

# Lines starting with a # are comments. You can write anything you like there and
# it will be ignored when 'run' in R/RStudio. These are useful for adding notes
# to yourself for later.

# This first command loads up the `tidyverse` library/package which includes
# `ggplot2` for creating pretty charts.
library(tidyverse)

# Now we'll load some data on earthquakes from around Fiji
data(quakes)

# Let's plot the earthquake magnitude versus the number
# of stations that detect them
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations))

# You can add more code or comments below here.

# Let's start by looking at another geometry.

# We already tried geom_jitter(), but this is really just a wrapper
# around geom_point() which specifies position=position_jitter():
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations),
             position=position_jitter())

# We'll start with a smoother:
ggplot(data=quakes) +
  geom_smooth(mapping=aes(x=mag, y=stations))

# This fits a smooth trend through the coordinates of the points. The idea
# is that it highlights the trend of the data. In particular, for each
# magnitude (the x coordiate) it is telling us what the *average* stations (y coordinate)
# is. That is the blue line.

# The grey band around the line is a measure of uncertainty as to where the line
# really lies.

# The grey band is *quantifying* the amount of uncertainty that we have about what
# the trend between these variables is in the **population** that we can infer from
# our sample. The idea is the sample is just a small piece of all possible earthquakes
# so can't tell us everything. But under some key assumptions (we have a random sample,
# and our model for the trend makes sense) we can use statistics (and a bunch of maths)
# to say something about those gaps - i.e. we can infer what the trend might look like
# in the population. But that inference will have some uncertainty which is represented
# by the grey band. The uncertainty is higher at the ends of the magnitude distribution
# as that is where we have less data. Having less data means we'll be more uncertain!

# It's important to also show the data on the plot as well as the data summary (the smoother)
# because the smoother doesn't tell us how much variation there is in the number of
# stations around the trend: it just shows the measure of center (the mean)

ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations), alpha=0.3) +
  geom_smooth(mapping=aes(x=mag, y=stations))

# We can reduce repetition by noting that the ggplot() function also has a mapping
# argument. Whatever we specify in the mapping argument for ggplot() will be inherited
# by all the geometry layers:

ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth()

# With this inheritance, sometimes you still want other aesthetics to be altered on
# a per-layer basis. e.g. maybe we want to colour the points by their depth, but
# we still want the smoother to be across all the data. We can do that by adding
# another mapping argument to geom_point()

ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(mapping=aes(col=depth), alpha=0.3) +
  geom_smooth()

# What happens if we mess up and add col=depth to the ggplot() mapping: This will mean
# that geom_smooth() gets the colour aesthetic set as well:
ggplot(data=quakes,
       mapping=aes(x=mag, y=stations, col=depth)) +
  geom_point(alpha=0.3) +
  geom_smooth()

# The warning message is telling us that the smoother cannot do separate smooths
# based on a numeric measure. It can do a separate smooth for a grouping variable
# though.

# e.g. we could dichotomise the depth into shallow and deep and then use that
# as a grouping variable.
quake_depth <- quakes |>
  mutate(how_deep = if_else(depth > 400, "deep", "shallow"))

ggplot(data=quake_depth,
       mapping=aes(x=mag, y=stations, col=how_deep)) +
  geom_point(alpha=0.3) +
  geom_smooth()

# Based on this the deeper quakes are perhaps felt more widely than the
# shallower quakes.

# What is the smoother? How is it created?
ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth()

# The smoother is created using y ~ s(x, bs="cs") a GAM - a Generalised additive model where the
# y coordinate is computed based on a smooth trend (the s function) which uses
# cubic splines (the cs bit).

# Let's switch to a different type of smoother. A "loess" or local linear smoother.
ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth(method = 'loess', span=0.75)

# This is a different smoother made up of local linear fits to the trend. For each
# magnitude we use information from the earthquakes around that magnitude to draw
# a straight line through the data. For each magnitude we get a different straight
# line which all link up to form a curve.

# The amount of data to consider for each of these local linear fits is governed
# by the span parameter. A smaller span will use less of the data for each fit,
# which will allow the overall trend to adapt faster to changes in shape. A larger
# trend will use more of the data so the overall trend adapts slower to changes
# in shape.
ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth(method = 'loess', span=0.4)

ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth(method = 'loess', span=1)

# Smaller spans adjust to the data quicker so introduce more signal.
# Larger spans smooth over the data more, so have a loss of signal.

# The bias-variance tradeoff is a key idea in statistics that will come
# up again and again. The idea is that there's two ways for an inference
# about a population to be non-ideal. One is bias: Bias happens when we
# get things wrong on average. The other is variance: Variance captures
# the amount our estimator will change when the data set changes (e.g.
# when we get another sample).

# Small spans will allow the trend to adapt to the data quickly, so
# give us potenially more signal, so lower bias. But, the trend from
# the loess estimator might adapt too well to individual samples of
# data, and if we get another sample, the trend fit to that might
# look quite different. Thus, we have higher variance.

# Large spans will mean that we smooth over quirks in the particular
# dataset we have so that smoothers from different data samples from
# the same population will look similar (low variance). But, each
# of them will be missing detail, which introduces bias.

# Somewhere there is an "optimal" span value that minimises bias and
# variance simultaneously.

# To demonstrate this idea, let's take some samples!
quake_samples <- quakes |>
  mutate(subsample = sample(6, n(), replace=TRUE))

ggplot(data = quake_samples |> filter(subsample == 1),
       mapping = aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth(method='loess', span=1)

ggplot(data = quake_samples,
       mapping = aes(x=mag, y=stations)) +
  geom_point(alpha=0.3) +
  geom_smooth(method='loess', span=0.75) +
  facet_wrap(vars(subsample))

# The idea here is that if we use a small span then each
# of the curves are adapting to the particular datasets quickly
# so are able to show us the trend well (low bias) but might
# be also picking up noise from the sampling process (high variance)
# so that they look different from sample to sample.

# Larger spans look less different from sample to sample (
# low variance) but are potentially oversmoothing some of the
# detail which means we're losing signal and introducing bias.

# There is a value of span that minimises bias and variance (but
# determining that optimum is hard or unsolved!)

# Labelling the chart

ggplot(data=quakes,
       mapping=aes(x=mag, y=stations)) +
  geom_point(mapping=aes(colour=depth), alpha=0.3) +
  geom_smooth() +
  labs(x = "Magnitude",
       y = "Number of stations",
       colour = "Depth (km)",
       title = "Earthquakes around Fiji",
       subtitle = "Larger earthquakes are felt more widely",
       caption = "Chart by JM")
